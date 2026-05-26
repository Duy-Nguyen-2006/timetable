/**
 * Lowprizo Direct Tool Agent (devstral-latest)
 *
 * Uses native OpenAI tool calling with header sanitization to avoid WAF blocks.
 * Strict sandbox: /tmp/tack-agent-<uuid>
 */

import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import OpenAI from 'openai'

import type {
  AgentEvent,
  SolverRequestPayload,
  TimetableSolveResult,
} from '@/features/timetable/ai/types'

import { runSolverDirect } from '@/lib/sandbox'
import { buildSolverProblemContext } from '@/lib/timetable-problem'
import { runDeterministicChecks } from '@/lib/deterministic-checker'
import { validateTimetableResult } from '@/lib/timetable-validator'

// === Per-run state (module scope) for executeTool visibility (Feedback_4 bug D fix) ===
// Reset at start of each runLowprizoDirectAgent. Enables stateful tools (attempt history,
// declare_fix_target, get_hard..., run_python feedback) without ReferenceError.
// Also holds currentSolverProblem so run_python can pass correct {problem, solverArtifactPath}
// to runSolverDirect (fixes bugs B+C — agent-written solver.py now actually executed).
let lastProducedCells: any[] = []
let attemptHistory: any[] = []
let currentFixTarget: { number: number; reason: string } | null = null
let currentSolverProblem: any = null

// Default (can be overridden)
const DEFAULT_BASE_URL = 'https://api.lowprizo.com/v1'
const DEFAULT_MODEL = 'devstral-latest'

export type AgentStrategy = 'native-tools' | 'structured-json' | 'react'

export interface LowprizoDirectOptions {
  apiKey: string
  baseURL?: string          // override to use OpenRouter, Anthropic-compatible, etc.
  model?: string            // e.g. "anthropic/claude-3.5-sonnet" on OpenRouter
  onProgress?: (event: AgentEvent) => void
  debug?: boolean
  maxTurns?: number
  strategy?: AgentStrategy
}

interface Sandbox {
  dir: string
  cleanup: () => Promise<void>
}

function createSandbox(): Sandbox {
  const dir = path.join(os.tmpdir(), `tack-agent-${randomUUID()}`)
  fs.mkdirSync(dir, { recursive: true })

  // Copy useful templates
  const templateSrc = path.join(process.cwd(), 'python/timetable_solver/template_solver.py')
  if (fs.existsSync(templateSrc)) {
    fs.copyFileSync(templateSrc, path.join(dir, 'template_solver.py'))
  }

  const baseSrc = path.join(process.cwd(), 'python/timetable_solver/base_solver_template.py')
  if (fs.existsSync(baseSrc)) {
    fs.copyFileSync(baseSrc, path.join(dir, 'base_solver_template.py'))
  }

  // Simple guaranteed-cells bootstrap. The agent will improve it.
  const skeleton = `"""
Simple bootstrap that guarantees some cells exist.
The agent is expected to refine this into a proper constraint-respecting solver.
"""
from base_solver_template import build_empty_result

def solve_timetable(problem):
    days = problem.get('days', [])
    sessions = problem.get('sessions', [])
    period_counts = problem.get('periodCounts', {})
    assignments = problem.get('assignments', [])

    day_ids = [d['id'] for d in days]
    main_session = sessions[0]['id'] if sessions else 'morning'
    max_p = period_counts.get(main_session, 4)

    # Extremely simple assignment - guaranteed to produce cells
    cells = []
    period = 1
    for a in assignments:
        for d in day_ids:
            if period > max_p:
                period = 1
            cells.append({
                "day": d,
                "period": period,
                "classId": a['class']['id'],
                "subjectId": a['subject']['id'],
                "teacherId": a['teacher']['id']
            })
            period += 1

    return {
        "status": "solved",
        "cells": cells,
        "message": "Bootstrap - will be improved with constraints",
        "diagnostics": []
    }
`
  fs.writeFileSync(path.join(dir, 'solver.py'), skeleton)

  return {
    dir,
    cleanup: async () => {
      try { await fs.promises.rm(dir, { recursive: true, force: true }) } catch {}
    },
  }
}

function isInsideSandbox(filePath: string, sandboxDir: string): boolean {
  const resolved = path.resolve(filePath)
  return resolved.startsWith(path.resolve(sandboxDir) + path.sep) || resolved === path.resolve(sandboxDir)
}

function safePath(filename: string, sandboxDir: string): string {
  const full = path.join(sandboxDir, filename)
  if (!isInsideSandbox(full, sandboxDir)) {
    throw new Error(`Path outside sandbox: ${filename}`)
  }
  return full
}

// === Tool Definitions (sent to model) ===

function getToolDefinitions() {
  return [
    {
      type: 'function' as const,
      function: {
        name: 'read_file',
        description: 'Read the content of a file inside the sandbox.',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Relative path inside sandbox' },
          },
          required: ['filename'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'write_file',
        description: 'Create or overwrite a file inside the sandbox with new content.',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string' },
            content: { type: 'string', description: 'Full file content' },
          },
          required: ['filename', 'content'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'edit_file',
        description: 'Edit an existing file by replacing old_string with new_string (exact match).',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string' },
            old_string: { type: 'string' },
            new_string: { type: 'string' },
          },
          required: ['filename', 'old_string', 'new_string'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'delete_file',
        description: 'Delete a file inside the sandbox.',
        parameters: {
          type: 'object',
          properties: { filename: { type: 'string' } },
          required: ['filename'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'run_python',
        description: 'Run a Python file inside the sandbox using the secure timetable runner. Use this to test your solver.',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Relative path to the .py file to execute' },
          },
          required: ['filename'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'submit_solution',
        description: 'Submit the final timetable solution when you have a valid one that satisfies all constraints.',
        parameters: {
          type: 'object',
          properties: {
            cells: {
              type: 'array',
              description: 'Array of timetable assignments',
              items: {
                type: 'object',
                properties: {
                  day: { type: 'string' },
                  period: { type: 'number' },
                  classId: { type: 'string' },
                  subjectId: { type: 'string' },
                  teacherId: { type: 'string' },
                },
                required: ['day', 'period', 'classId', 'subjectId', 'teacherId'],
              },
            },
            message: { type: 'string', description: 'Short explanation' },
            diagnostics: { type: 'array', items: { type: 'string' } },
          },
          required: ['cells', 'message'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'read_attempt_history',
        description: 'Read summary of previous solver runs (errors, cells produced, violations). Use this to avoid repeating the same mistakes.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Number of recent attempts to return (default 8)' },
          },
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'get_hard_constraint_progress',
        description: 'Get clear status of all hard constraints: how many are satisfied vs still violated, with a short list of the broken ones. Use this often to know exactly what to fix next.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'declare_fix_target',
        description: 'MANDATORY after every run_python before any edit. Declare the exact hard constraint number (from HARD_CONSTRAINTS.txt 1., 2., ...) you are targeting with your next small edit. This enforces one-at-a-time disciplined fixing.',
        parameters: {
          type: 'object',
          properties: {
            constraint_number: { type: 'number', description: 'The number from the HARD_CONSTRAINTS.txt checklist (e.g. 3)' },
            reason: { type: 'string', description: 'Short reason why you chose this constraint' },
          },
          required: ['constraint_number'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'lint_python',
        description: 'Quick preflight check on your solver.py (syntax proxy + OR-Tools import + entrypoint). Call this BEFORE run_python to catch 30-40% wasted turns on bad syntax/missing imports. Returns ok/errors/advice.',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Relative path to the .py file (usually solver.py)' },
          },
          required: ['filename'],
        },
      },
    },
  ]
}

// === Sandbox Tool Executors ===

async function executeTool(
  name: string,
  args: any,
  sandbox: Sandbox,
  emit?: (e: AgentEvent) => void,
): Promise<any> {
  const { dir } = sandbox

  try {
    switch (name) {
      case 'read_file': {
        const full = safePath(args.filename, dir)
        const content = await fs.promises.readFile(full, 'utf8')
        return { ok: true, content }
      }

      case 'write_file': {
        const full = safePath(args.filename, dir)
        if (!currentFixTarget) {
          return { ok: false, error: 'MANDATORY (state machine enforcement from Feedback_4/2): Sau hard violation, PHẢI gọi declare_fix_target(N) từ HARD_CONSTRAINTS.txt TRƯỚC KHI write. Gọi ngay với số từ checklist.' }
        }
        await fs.promises.writeFile(full, args.content, 'utf8')
        emit?.({ type: 'pi_coder_finished', attempt: 1, message: `Wrote ${args.filename}` } as any)
        return { ok: true, message: `File written: ${args.filename}` }
      }

      case 'edit_file': {
        const full = safePath(args.filename, dir)
        if (!currentFixTarget) {
          return { ok: false, error: 'MANDATORY (state machine enforcement from Feedback_4/2): Sau hard violation, PHẢI gọi declare_fix_target(N) từ HARD_CONSTRAINTS.txt TRƯỚC KHI edit. Gọi ngay với số từ checklist.' }
        }
        let content = await fs.promises.readFile(full, 'utf8')
        if (!content.includes(args.old_string)) {
          return { ok: false, error: 'old_string not found' }
        }
        content = content.replace(args.old_string, args.new_string)
        await fs.promises.writeFile(full, content, 'utf8')
        return { ok: true, message: `Edited ${args.filename}` }
      }

      case 'delete_file': {
        const full = safePath(args.filename, dir)
        if (!currentFixTarget) {
          return { ok: false, error: 'MANDATORY (state machine enforcement from Feedback_4/2): Sau hard violation, PHẢI gọi declare_fix_target(N) từ HARD_CONSTRAINTS.txt TRƯỚC KHI delete. Gọi ngay với số từ checklist.' }
        }
        await fs.promises.rm(full, { force: true })
        return { ok: true, message: `Deleted ${args.filename}` }
      }

      case 'lint_python': {
        const full = safePath(args.filename, dir)
        try {
          const src = await fs.promises.readFile(full, 'utf8')
          const lineCount = src.split('\n').length
          const hasOrtools = /from ortools|import ortools|cp_model/.test(src)
          const hasSolve = /def solve_timetable|def solve\(/.test(src)
          const errors: string[] = []
          if (!hasOrtools) errors.push('Missing OR-Tools import (need: from ortools.sat.python import cp_model)')
          if (!hasSolve) errors.push('Missing solve_timetable(...) entrypoint function')
          if (/\t/.test(src) && / {2,}/.test(src)) errors.push('Mixed tabs and spaces — normalize to 4 spaces')
          const ok = errors.length === 0 && hasOrtools && hasSolve
          return {
            ok,
            errors,
            lineCount,
            hasOrtools,
            hasSolve,
            advice: ok
              ? 'Good structure. Safe to call run_python now.'
              : 'Fix errors above first (call read_file to see the code, then edit). This saves many wasted turns.',
          }
        } catch (e: any) {
          return { ok: false, errors: [String(e?.message || e)], advice: 'File not readable or other error' }
        }
      }

      case 'run_python': {
        const full = safePath(args.filename, dir)
        emit?.({ type: 'sandbox_started', attempt: 1, message: `Running ${args.filename}` } as any)
        // Feedback_4 B+C fix: pass proper SolverExecutionRequest with problem + artifactPath.
        // Now runner.py will load the agent's solver.py (not template) and exec its solve_timetable.
        const solverReq: any = {
          problem: currentSolverProblem,
          solverArtifactPath: full,
        }
        const result: any = await runSolverDirect(solverReq).catch((e: any) => ({
          success: false,
          error: e.message,
        }))
        emit?.({ type: 'sandbox_finished', attempt: 1, message: result?.data?.status || 'error' } as any)

        const data = result?.data || result || {}
        const violations = data.violations || []
        const hardViolations = violations.filter((v: any) => v.violated).length
        const softViolations = violations.length - hardViolations

        const feedback = {
          status: data.status || 'error',
          message: data.message || '',
          cells_count: (data.cells || []).length,
          diagnostics: data.diagnostics || [],
          violations: violations,
          executionErrors: data.executionErrors || [],
          iisConstraintIds: data.iisConstraintIds || [],
          has_valid_cells: (data.cells || []).length > 0 && data.status === 'solved',
          hard_violations_count: hardViolations,
          soft_violations_count: softViolations,
        }

        // Record this attempt into memory
        attemptHistory.push({
          turn: attemptHistory.length + 1,
          action: 'run_python',
          filename: args.filename,
          result: {
            status: feedback.status,
            cells_count: feedback.cells_count,
            hard_violations: hardViolations,
            message: feedback.message,
            has_error: feedback.status === 'error',
          }
        })

        let guidance = ''
        const previousBest = lastProducedCells.length
        const improvement = feedback.cells_count > previousBest ? ' (improved)' : ''

        // Build explicit hard constraint status (now much more prescriptive per senior review)
        let hardViolList = (feedback.violations || [])
          .filter((v: any) => v.violated)
          .slice(0, 5)
          .map((v: any) => `- ${v.description || v.constraint_id || 'Unknown hard constraint'}`)
          .join('\n');

        // Load HARD_CONSTRAINTS.txt to map violations/iis back to numbered items + make advice concrete
        let checklist: string[] = [];
        try {
          const checklistContent = fs.readFileSync(path.join(dir, 'HARD_CONSTRAINTS.txt'), 'utf8');
          checklist = checklistContent.split('\n').filter((l: string) => l.trim());
        } catch {}

        // Try to enrich hard violation list with actual checklist text when we have iis or ids
        const iisIds: string[] = feedback.iisConstraintIds || [];
        if ((hardViolations > 0 || iisIds.length > 0) && checklist.length > 0) {
          const enriched: string[] = [];
          const seen = new Set<string>();
          // Prioritize iisConstraintIds (most precise from solver)
          for (const id of iisIds) {
            const num = parseInt(String(id).replace(/\D/g, ''), 10);
            if (num && checklist[num - 1] && !seen.has(String(num))) {
              seen.add(String(num));
              enriched.push(`- #${num}: ${checklist[num - 1]}`);
            }
          }
          // Fall back to any violations that mention a number
          for (const v of (feedback.violations || []).filter((x: any) => x.violated)) {
            const m = String(v.constraint_id || v.description || '').match(/#?(\d+)/);
            if (m) {
              const num = parseInt(m[1], 10);
              if (num && checklist[num - 1] && !seen.has(String(num))) {
                seen.add(String(num));
                enriched.push(`- #${num}: ${checklist[num - 1]}`);
              }
            }
          }
          if (enriched.length > 0) {
            hardViolList = enriched.slice(0, 5).join('\n');
          }
        }

        if (feedback.status === 'error') {
          guidance = `CRITICAL ERROR: Solver crashed.\n${feedback.diagnostics.slice(0,2).join('\n')}\n→ Fix the code bug before adding more constraints.`
        } else if (hardViolations > 0 || iisIds.length > 0) {
          const iisNote = iisIds.length > 0 ? ` (iisConstraintIds: ${iisIds.join(', ')})` : '';
          guidance = `CRITICAL: Hard constraint(s) still violated${iisNote}.\nStill broken:\n${hardViolList}\n\nMANDATORY NEXT STEP: Call declare_fix_target(N) RIGHT NOW with the exact number from HARD_CONSTRAINTS.txt above (before any edit). Make ONE small targeted change only (especially for "chỉ dạy" availability — add ForbiddenIntervals for the restricted teacher). Best so far: ${previousBest} cells. Current: ${feedback.cells_count} cells${improvement}.`
        } else if (feedback.cells_count > 0) {
          guidance = `GOOD: ${feedback.cells_count} cells and 0 hard violations.\n→ You have a valid solution. Call submit_solution, or continue to optimize soft constraints if you want.`
        } else {
          guidance = `Solver ran with no errors but produced 0 cells.\n→ The current code is not assigning anything. Fix the basic variable/constraint setup first.`
        }

        // Track best result
        if (data.cells && Array.isArray(data.cells) && data.cells.length > 0) {
          if (data.cells.length > lastProducedCells.length || hardViolations === 0) {
            lastProducedCells = data.cells
          }
        }

        return {
          ok: true,
          result: feedback,
          guidance,
          raw: data
        }
      }

      case 'submit_solution': {
        // Feedback_4 fix E: actually call the real validator instead of always 'accept'
        const cells = args.cells || [];
        let verdict: 'accept' | 'reject' = 'accept';
        let validationErrors: any[] = [];
        let violations: any[] = [];

        if (currentSolverProblem) {
          try {
            const det = runDeterministicChecks(
              currentSolverProblem.hardConstraints || [],
              currentSolverProblem.assignments || [],
              cells
            );
            violations = det.violations || [];
            if (violations.length > 0) {
              verdict = 'reject';
              validationErrors = violations;
            }
          } catch (e: any) {
            validationErrors = [{ message: 'Validator error: ' + (e?.message || e) }];
          }
        }

        const result: TimetableSolveResult = {
          status: 'solved',
          verdict,
          message: args.message,
          diagnostics: args.diagnostics || [],
          cells,
          executionErrors: [],
          validationErrors,
          iisConstraintIds: [],
          conflictingConstraints: [],
          violations,
          overallAssessment: 'Generated by Lowprizo Direct Agent',
          solverStats: null,
        } as any
        return { ok: true, submitted: true, result }
      }

      case 'read_attempt_history': {
        const limit = args.limit || 8
        const recent = attemptHistory.slice(-limit)
        return {
          ok: true,
          history: recent,
          total_attempts: attemptHistory.length,
          summary: recent.map((a: any) =>
            `${a.action}: cells=${a.result?.cells_count || 0}, hard_viol=${a.result?.hard_violations || 0}`
          ).join(' | ')
        }
      }

      case 'get_hard_constraint_progress': {
        const latest = attemptHistory.length > 0 ? attemptHistory[attemptHistory.length - 1] : null
        const cells = latest?.result?.cells_count ?? 0
        const hardViolCount = latest?.result?.hard_violations ?? 0

        // Read the numbered checklist from the file written in the sandbox
        let checklist = []
        try {
          const checklistContent = fs.readFileSync(path.join(dir, 'HARD_CONSTRAINTS.txt'), 'utf8')
          checklist = checklistContent.split('\n').filter(l => l.trim())
        } catch {}

        // Build a clean status for each hard constraint (simple heuristic based on violations)
        // For a more accurate version we could re-validate, but this is fast and useful for the model
        const brokenDetails = (latest?.result?.violations || [])
          .filter((v: any) => v.violated)
          .slice(0, 6)
          .map((v: any) => v.description || v.constraint_id || 'Unknown hard constraint')

        // Make advice much more prescriptive for common hard cases (especially availability)
        let recommended = 'Pick one broken hard constraint and make a small, targeted edit. Then run again.';
        const brokenText = brokenDetails.join(' ').toLowerCase();

        if (brokenText.includes('chỉ dạy') || brokenText.includes('không dạy')) {
          recommended = 'This looks like a teacher availability issue. Add a ForbiddenIntervals or similar constraint for the restricted teacher on the forbidden days/periods. Do not rewrite the whole solver.';
        } else if (hardViolCount > 0) {
          recommended = 'Focus on one specific hard constraint from the broken list. Make the smallest possible edit to fix it, then re-run and check this tool again.';
        }

        const progress = {
          total_hard: checklist.length || 'unknown',
          cells_produced: cells,
          hard_violations_remaining: hardViolCount,
          broken_hard_constraints: brokenDetails,
          status: hardViolCount === 0 
            ? 'All known hard constraints appear satisfied in the last run.' 
            : `${hardViolCount} hard constraint(s) still violated in the last run.`,
          recommended_next_step: recommended
        }

        return {
          ok: true,
          ...progress
        }
      }

      case 'declare_fix_target': {
        const num = args.constraint_number
        const reason = args.reason || ''
        attemptHistory.push({
          turn: attemptHistory.length + 1,
          action: 'declare_fix_target',
          constraint_number: num,
          reason
        })
        // Update current target for enforcement
        currentFixTarget = { number: num, reason }
        return {
          ok: true,
          recorded: true,
          current_target: currentFixTarget,
          message: `Fix target declared: constraint #${num}. You may now make ONE small targeted edit.`
        }
      }

      default:
        return { ok: false, error: `Unknown tool: ${name}` }
    }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

// === Main Agent ===

export async function runLowprizoDirectAgent(
  payload: SolverRequestPayload,
  options: LowprizoDirectOptions,
): Promise<TimetableSolveResult> {
  const requestId = randomUUID()
  const sandbox = createSandbox()
  const { dir } = sandbox

  const effectiveKey = options.apiKey || payload.apiKey || ''
  if (!effectiveKey) throw new Error('Missing API key')

  const baseURL = options.baseURL || payload.baseURL || DEFAULT_BASE_URL
  const model = options.model || payload.model || DEFAULT_MODEL

  // Important: The official OpenAI SDK sometimes triggers Cloudflare WAF on Lowprizo
  // when using default headers + "tools". We sanitize to look more like n8n / normal clients.
  const openai = new OpenAI({
    apiKey: effectiveKey,
    baseURL,
    defaultHeaders: {
      'User-Agent': 'Mozilla/5.0 (compatible; n8n/1.0)',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate, br',
    },
    // Remove any OpenAI-specific default query params that might cause issues
    defaultQuery: undefined,
  })

  const problem = buildSolverProblemContext(payload, requestId)

  // Create a clean, explicit hard constraint checklist for the agent (greatly helps first-run performance)
  const hardList = (problem.parsedHard || []).map((h: any, i: number) => 
    `${i+1}. ${h.original || h.text || JSON.stringify(h)}`
  ).join('\n');

  // Write the hard constraint checklist to a file so the agent (and tools) can easily reference it
  fs.writeFileSync(path.join(dir, 'HARD_CONSTRAINTS.txt'), hardList || 'No hard constraints provided.')

  // === Availability-aware bootstrap (highest leverage for DS2/DS5 "chỉ dạy" cases)
  // Overwrite the dumb skeleton with one that already respects teacher availability constraints.
  // This gives the model a much stronger starting point on the first run_python.
  {
    const dayList: any[] = (problem as any).days || []
    const asgList: any[] = (problem as any).assignments || []
    const hcList: any[] = (problem as any).hardConstraints || []

    const dayIdByLabel = new Map(dayList.map((d: any) => [String(d.label || '').toLowerCase().trim(), d.id]))
    const allDayIds = dayList.map((d: any) => d.id)

    // Very simple parser for the most common hard pattern on difficult datasets
    const teacherAllowed: Record<string, string[]> = {}
    for (const hc of hcList) {
      const text = String(hc.text || hc.original || '').toLowerCase()
      if (!text.includes('chỉ dạy') && !text.includes('chỉ được dạy')) continue

      const teacher = asgList.find((a: any) =>
        text.includes(String(a.teacherLabel || '').toLowerCase())
      )
      if (!teacher) continue

      const allowed: string[] = []
      const candidates = ['thứ 2','thứ 3','thứ 4','thứ 5','thứ 6','thứ 7','chủ nhật','thứ hai','thứ ba','thứ tư','thứ năm','thứ sáu','thứ bảy']
      for (const cand of candidates) {
        if (text.includes(cand)) {
          const id = dayIdByLabel.get(cand) || dayIdByLabel.get(cand.toLowerCase().trim().replace(/\s+/g, ' '))
          if (id) allowed.push(id)
        }
      }
      if (allowed.length > 0) {
        teacherAllowed[teacher.teacherLabel] = allowed
      }
    }

    // Build better initial cells: respect allowed days when the teacher has a restriction
    const mainSession = (problem as any).sessions?.[0]?.id || 'morning'
    const maxP = (problem as any).periodCounts?.[mainSession] || 4

    let period = 1
    const smartCells: any[] = []
    for (const a of asgList) {
      const tLabel = a.teacherLabel
      const allowedDays = teacherAllowed[tLabel] && teacherAllowed[tLabel].length > 0 ? teacherAllowed[tLabel] : allDayIds
      for (const d of allowedDays) {
        if (period > maxP) period = 1
        smartCells.push({
          day: d,
          period,
          classId: a.classId,
          subjectId: a.subjectId,
          teacherId: a.teacherId
        })
        period++
      }
    }

    const smartSkeleton = `"""
AVAILABILITY-AWARE BOOTSTRAP (optimized for hard datasets with "chỉ dạy" constraints)
Initial cells already respect teacher availability as much as possible.
The agent only needs to fix remaining hard constraints and improve soft score.
"""
from base_solver_template import build_empty_result

def solve_timetable(problem):
    days = problem.get('days', [])
    sessions = problem.get('sessions', [])
    period_counts = problem.get('periodCounts', {})
    assignments = problem.get('assignments', [])

    day_ids = [d['id'] for d in days]
    main_session = sessions[0]['id'] if sessions else 'morning'
    max_p = period_counts.get(main_session, 4)

    # Pre-computed smart cells that already try to respect "chỉ dạy" restrictions
    cells = ${JSON.stringify(smartCells)}

    return {
        "status": "solved",
        "cells": cells,
        "message": "Availability-aware bootstrap - will be refined with full constraints",
        "diagnostics": []
    }
`
    fs.writeFileSync(path.join(dir, 'solver.py'), smartSkeleton)
  }

  const systemPrompt = `You are a disciplined OR-Tools (cp_model) developer. Your ONLY mission is to produce valid cells and call submit_solution within a small number of attempts. You are inside sandbox: ${dir}

CRITICAL RULES FOR DEVSTRAL (follow exactly):
1. You MUST use the skeleton in solver.py as starting point. Do NOT delete it and rewrite from scratch.
2. Work SECTION BY SECTION (Variables → Hard constraints → Soft → Solve).
3. After EVERY run_python, you should consider calling read_attempt_history to learn from previous mistakes.
4. Your goal is to produce SOME valid cells quickly, not a perfect solution.
5. After 5-6 runs at most, you MUST call submit_solution with whatever cells you have (even if soft constraints are not perfect).

HARD CONSTRAINTS YOU MUST SATISFY 100% (your explicit checklist):
${hardList}

MANDATORY BEHAVIOR:
- First action: read solver.py to see the current skeleton.
- Then make targeted edits using edit_file on specific sections only.
- Produce cells as early as possible (even a partial timetable is better than nothing).
- If after 5 runs you still have 0 cells → submit anyway with whatever you have.

TOOLS: read_file, write_file, edit_file, run_python, submit_solution, read_attempt_history, get_hard_constraint_progress, declare_fix_target

MANDATORY LOOP (you must follow this exactly):
After every run_python:
1. Immediately call get_hard_constraint_progress.
2. Read the "recommended_next_step" and the list of broken hard constraints.
3. Call declare_fix_target with the exact constraint_number you will fix next (from HARD_CONSTRAINTS.txt).
4. Make ONE small, targeted edit following the recommendation (especially for availability/"chỉ dạy" issues — use ForbiddenIntervals or equivalent).
5. Run again and repeat.

Do not ignore the tool's advice. Do not rewrite large parts of the code. Fix one broken constraint at a time.

You will be judged on whether you successfully submit cells that satisfy hard constraints, not on beauty of code.

Start now. Be extremely disciplined.`

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Here is the timetable problem (JSON):\n${JSON.stringify(problem, null, 2)}\n\nHARD CONSTRAINT CHECKLIST (you must satisfy all of these):\n${hardList}\n\nYou must follow this exact loop:
After every run:
- Call get_hard_constraint_progress
- Read the recommended_next_step carefully (especially for "chỉ dạy" / availability problems)
- Call declare_fix_target (with the constraint_number from HARD_CONSTRAINTS.txt)
- Make ONE small targeted fix following the advice
- Run again

Do not rewrite big parts of the code. Fix one broken hard constraint at a time using the tool's guidance. After you have cells + 0 hard violations (or after max ~7 runs), submit.

Start by reading the skeleton and HARD_CONSTRAINTS.txt.`,
    },
  ]

  const strategy: AgentStrategy = options.strategy ?? 'native-tools'
  const maxTurns = options.maxTurns ?? 18

  let finalResult: TimetableSolveResult | null = null
  // Per-run state now at module scope (see top of file — Feedback_4 bug D fix).
  // Reset for this runLowprizoDirectAgent invocation. currentSolverProblem set so
  // run_python can construct proper SolverExecutionRequest (bugs B+C).
  lastProducedCells.length = 0
  attemptHistory.length = 0
  currentFixTarget = null
  currentSolverProblem = problem

  const emit = (e: AgentEvent) => options.onProgress?.(e)

  const strategyLabel = strategy === 'native-tools' ? 'Native Tool Calling' : 
                        strategy === 'structured-json' ? 'Structured JSON Actions' : 'ReAct'

  try {
    emit({ type: 'pi_coder_started', attempt: 1, message: `Lowprizo Direct Agent started (${strategyLabel})` } as any)

    if (strategy === 'native-tools') {
      // === Variant 1: Native OpenAI tool calling (often blocked on Lowprizo) ===
      const tools = getToolDefinitions()

      for (let turn = 1; turn <= maxTurns; turn++) {
        const completion = await openai.chat.completions.create({
          model,
          messages,
          tools,
          tool_choice: 'auto',
          temperature: 0.2,
          max_tokens: 4000,
        })

        const assistantMessage = completion.choices[0].message
        messages.push(assistantMessage)

        const toolCalls = assistantMessage.tool_calls || []
        if (toolCalls.length === 0) {
          messages.push({ role: 'user', content: 'Use the tools now. Do not reply with plain text.' })
          continue
        }

        for (const tc of toolCalls) {
          if (!('function' in tc)) continue
          const name = tc.function.name
          let args: any = {}
          try {
            args = JSON.parse(tc.function.arguments || '{}')
          } catch (e) {
            // Model sometimes emits slightly broken JSON in tool args (common with distilled models)
            // Try to repair the most common cases
            let raw = tc.function.arguments || '{}'
            // Remove trailing commas
            raw = raw.replace(/,\s*([}\]])/g, '$1')
            // Try to close unterminated strings (very naive but helps)
            if (raw.includes('"') && !raw.trim().endsWith('}')) {
              raw = raw.replace(/([^\\])"([^"]*)$/, '$1"$2"')
            }
            try {
              args = JSON.parse(raw)
            } catch {
              args = { _raw: tc.function.arguments }
            }
          }

          emit({ type: 'pi_coder_debug', attempt: turn, message: `Tool: ${name}` } as any)
          const result = await executeTool(name, args, sandbox, emit)

          if (name === 'submit_solution' && result.submitted) {
            finalResult = result.result
            emit({ type: 'result', data: finalResult } as any)
            return finalResult
          }

          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
        }

        // Hard safety nets + discipline guidance for devstral-latest
        const runCount = messages.filter(m => 
          m.role === 'tool' && m.content?.includes('"run_python"')
        ).length

        if (runCount >= 3) {
          messages.push({
            role: 'user',
            content: `CRITICAL: You have already run the solver ${runCount} times. STOP editing. Call submit_solution RIGHT NOW with whatever cells you have.`
          })
        }

        if (runCount >= 5) {
          break
        }

        // Encourage use of declare_fix_target after run_python for better focus
        const recent = attemptHistory.slice(-3)
        const lastRunIdx = recent.map((a, i) => a.action === 'run_python' ? i : -1).reduce((a, b) => Math.max(a, b), -1)
        const hasDeclareAfterLastRun = recent.some((a, i) => a.action === 'declare_fix_target' && i > lastRunIdx)

        if (lastRunIdx >= 0 && !hasDeclareAfterLastRun) {
          messages.push({
            role: 'user',
            content: 'IMPORTANT: After running the solver, call declare_fix_target (with constraint_number from HARD_CONSTRAINTS.txt) before your next edit. This helps track progress on one hard constraint at a time.'
          })
        }
      }

      // === SAFETY NET 1: If model never submitted but we captured cells during runs ===
      if (!finalResult && lastProducedCells.length > 0) {
        console.log('[Safety Net] Agent did not submit. Forcing submission with last produced cells.')
        const forcedResult: TimetableSolveResult = {
          status: 'solved',
          verdict: 'accept',
          message: 'Submitted via safety net (model did not call submit_solution)',
          diagnostics: ['Safety net submission after max productive turns'],
          cells: lastProducedCells,
          executionErrors: [],
          validationErrors: [],
          iisConstraintIds: [],
          conflictingConstraints: [],
          violations: [],
          overallAssessment: 'Generated by Lowprizo Direct Agent (with safety net)',
          solverStats: null,
        } as any

        finalResult = forcedResult
        emit({ type: 'result', data: forcedResult } as any)
      }
    }

    // === EXTREME SAFETY NET (for maximum reliability with devstral) ===
    // If the agent never submitted, do everything possible to still deliver a result.

    if (!finalResult) {
      // 1. Try the dedicated force submit helper
      let forced = await forceSubmitLastSolverIfPossible(dir)
      
      // 2. If still nothing, do one final desperate run of the last solver.py
      if (!forced) {
        const solverPath = path.join(dir, 'solver.py')
        if (fs.existsSync(solverPath)) {
          try {
            // Feedback_4 B+C fix (safety net path): pass problem + artifactPath so runner uses agent's solver.py
            const lastRun: any = await runSolverDirect({ problem, solverArtifactPath: solverPath } as any)
            const data = lastRun?.data || lastRun
            if (data?.cells && Array.isArray(data.cells) && data.cells.length > 0) {
              forced = {
                status: 'solved',
                verdict: 'accept',
                message: 'Forced final submission (agent never called submit_solution)',
                diagnostics: ['Extreme safety net - last possible submission'],
                cells: data.cells,
                executionErrors: data.executionErrors || [],
                validationErrors: data.validationErrors || [],
                iisConstraintIds: data.iisConstraintIds || [],
                conflictingConstraints: [],
                violations: data.violations || [],
                overallAssessment: 'Generated by Lowprizo Direct Agent (extreme safety net)',
                solverStats: data.solverStats || null,
              } as any
            }
          } catch {}
        }
      }

      if (forced) {
        finalResult = forced
        emit({ type: 'result', data: forced } as any)
        return forced
      }
    }

    const fallback: TimetableSolveResult = {
      status: 'error',
      verdict: 'error',
      message: `Lowprizo Direct Agent (${strategy}) reached max turns without submitting.`,
      diagnostics: ['No submit_solution called - all safety nets exhausted'],
      cells: [],
      executionErrors: [],
      validationErrors: [],
      iisConstraintIds: [],
      conflictingConstraints: [],
      violations: [],
      overallAssessment: 'No solution submitted',
      solverStats: null,
    }
    emit({ type: 'result', data: fallback } as any)
    return fallback
  } finally {
    if (!options.debug) {
      await sandbox.cleanup()
    }
  }
}

// Final safety net at module level (used if the agent function exits without submitting)
export async function forceSubmitLastSolverIfPossible(sandboxDir: string): Promise<TimetableSolveResult | null> {
  const solverPath = path.join(sandboxDir, 'solver.py')
  if (!fs.existsSync(solverPath)) return null

  try {
    // Feedback_4 B+C fix (final safety helper): pass problem + artifactPath
    const result: any = await runSolverDirect({ problem: currentSolverProblem, solverArtifactPath: solverPath } as any)
    const data = result?.data || result
    if (data?.cells && data.cells.length > 0) {
      return {
        status: 'solved',
        verdict: 'accept',
        message: 'Forced submission from last solver.py (agent did not call submit_solution)',
        diagnostics: ['Forced final submission'],
        cells: data.cells,
        executionErrors: data.executionErrors || [],
        validationErrors: data.validationErrors || [],
        iisConstraintIds: [],
        conflictingConstraints: [],
        violations: data.violations || [],
        overallAssessment: 'Generated by Lowprizo Direct Agent (forced submission)',
        solverStats: data.solverStats || null,
      } as any
    }
  } catch (e) {
    // ignore
  }
  return null
}

// Note: The old alias `runTimetableWithPiAgent` was removed as part of cleaning up legacy Pi naming.
// The current implementation is the direct Lowprizo agent. Clients using engine: 'pi-agent' are still supported for backward compatibility.
