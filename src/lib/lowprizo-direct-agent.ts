/**
 * Lowprizo Direct Tool Agent
 *
 * Replaces the old Pi SDK integration.
 * Uses native OpenAI tool calling (with header sanitization to avoid WAF blocks).
 *
 * Supports configurable baseURL + model (you can point it at OpenRouter + Claude if needed).
 *
 * Strict sandbox: all operations limited to /tmp/tack-agent-<uuid>
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
        await fs.promises.writeFile(full, args.content, 'utf8')
        emit?.({ type: 'pi_coder_finished', attempt: 1, message: `Wrote ${args.filename}` } as any)
        return { ok: true, message: `File written: ${args.filename}` }
      }

      case 'edit_file': {
        const full = safePath(args.filename, dir)
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
        await fs.promises.rm(full, { force: true })
        return { ok: true, message: `Deleted ${args.filename}` }
      }

      case 'run_python': {
        const full = safePath(args.filename, dir)
        emit?.({ type: 'sandbox_started', attempt: 1, message: `Running ${args.filename}` } as any)
        const result: any = await runSolverDirect(full as any).catch((e: any) => ({
          success: false,
          error: e.message,
        }))
        emit?.({ type: 'sandbox_finished', attempt: 1, message: result?.data?.status || 'error' } as any)
        return { ok: true, result: result?.data || result }
      }

      case 'submit_solution': {
        const result: TimetableSolveResult = {
          status: 'solved',
          verdict: 'accept',
          message: args.message,
          diagnostics: args.diagnostics || [],
          cells: args.cells || [],
          executionErrors: [],
          validationErrors: [],
          iisConstraintIds: [],
          conflictingConstraints: [],
          violations: [],
          overallAssessment: 'Generated by Lowprizo Direct Agent',
          solverStats: null,
        } as any
        return { ok: true, submitted: true, result }
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

  const systemPrompt = `You are an expert OR-Tools (cp_model) timetable solver writer.

You work ONLY inside this sandbox directory: ${dir}

MANDATORY RULES:
- You must satisfy ALL base constraints: one teacher can only teach one class at a time, one class can only have one subject at a time, correct number of periods per week.
- All hard constraints provided by the user MUST be satisfied 100%.
- Soft constraints should be optimized by priority.

You have these tools: read_file, write_file, edit_file, delete_file, run_python, submit_solution.

Workflow:
1. Explore the sandbox (read template_solver.py and base_solver_template.py).
2. Write a complete solver.py that uses the provided templates.
3. Use run_python to test it.
4. Fix errors using edit_file.
5. When you have a correct solution that satisfies all constraints, call submit_solution with the cells.

Be direct and efficient. Use tools aggressively.`

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Here is the timetable problem (JSON):\n${JSON.stringify(problem, null, 2)}\n\nStart by reading the template files and writing a working solver.`,
    },
  ]

  const strategy: AgentStrategy = options.strategy ?? 'structured-json'
  const maxTurns = options.maxTurns ?? 18

  let finalResult: TimetableSolveResult | null = null

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
      }
    } else {
      // === Variant 2 & 3: Structured / ReAct (no tools param → bypass 403) ===
      // Force model to output one clean ACTION JSON at the end of every response.
      const actionInstruction = `
You must respond with reasoning + exactly ONE JSON action at the very end.
Format:
{
  "action": "read_file" | "write_file" | "edit_file" | "delete_file" | "run_python" | "submit_solution",
  "args": { ... }
}
Only output valid JSON for the action. No markdown fences around the JSON.`

      for (let turn = 1; turn <= maxTurns; turn++) {
        const completion = await openai.chat.completions.create({
          model,
          messages,
          // No "tools" array on purpose — this often triggers 403 on Lowprizo
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: 4000,
        })

        let content = completion.choices[0].message.content || ''
        messages.push({ role: 'assistant', content })

        emit({ type: 'pi_coder_debug', attempt: turn, message: `Raw: ${content.slice(0, 350)}` } as any)

        // Extract the last JSON object from the response
        let action: any = null
        try {
          // Try to find a JSON object in the response
          const jsonMatch = content.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            action = JSON.parse(jsonMatch[0])
          }
        } catch {}

        if (!action || !action.action) {
          messages.push({
            role: 'user',
            content: 'You must output exactly one JSON action object at the end. ' + actionInstruction,
          })
          continue
        }

        const name = action.action
        const args = action.args || {}

        emit({ type: 'pi_coder_debug', attempt: turn, message: `Parsed Action: ${name}` } as any)

        const result = await executeTool(name, args, sandbox, emit)

        if (name === 'submit_solution' && result.submitted) {
          finalResult = result.result
          emit({ type: 'result', data: finalResult } as any)
          return finalResult
        }

        messages.push({
          role: 'user',
          content: `Tool result for ${name}:\n${JSON.stringify(result)}`,
        })
      }
    }

    // Max turns reached
    const fallback: TimetableSolveResult = {
      status: 'error',
      verdict: 'error',
      message: `Lowprizo Direct Agent (${strategy}) reached max turns without submitting.`,
      diagnostics: ['No submit_solution called'],
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

// Drop-in replacement export so existing code (service.ts) can keep using the same name
export { runLowprizoDirectAgent as runTimetableWithPiAgent }
