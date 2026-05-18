import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { NextResponse } from 'next/server'

import { compileConstraintsWithAI, verifySolutionWithAI } from '@/features/timetable/ai/devstral'
import { buildSolverInput, extractEntities } from '@/features/timetable/ai/normalize'
import { buildCompilerPrompts } from '@/features/timetable/ai/prompt'
import type { TimetableSolveResult, VerifierResult } from '@/features/timetable/ai/types'

const REPO_ROOT = process.cwd()
const PYTHON_RUNNER = path.join(REPO_ROOT, 'python', 'timetable_solver', 'runner.py')

// Solver subprocess timeout (ms)
const SOLVER_TIMEOUT_MS = 30_000

function getLocalVenvCandidates() {
  return [
    path.join(REPO_ROOT, ['.venv', 'bin', 'python'].join(path.sep)),
    path.join(REPO_ROOT, ['.venv', 'Scripts', 'python.exe'].join(path.sep)),
  ]
}

function resolvePythonBin() {
  if (process.env.TIMETABLE_PYTHON_BIN) {
    return process.env.TIMETABLE_PYTHON_BIN
  }

  for (const candidate of getLocalVenvCandidates()) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return process.platform === 'win32' ? 'python' : existsSync('/usr/bin/python3') ? 'python3' : 'python'
}

function resolveRunnerCommand(pythonBin: string) {
  if (process.env.TIMETABLE_PYTHON_RUNNER_DIR) {
    const bundledRunner = process.platform === 'win32'
      ? path.join(process.env.TIMETABLE_PYTHON_RUNNER_DIR, 'runner.exe')
      : path.join(process.env.TIMETABLE_PYTHON_RUNNER_DIR, 'runner')

    if (existsSync(bundledRunner)) {
      return {
        command: bundledRunner,
        args: [],
        cwd: process.env.TIMETABLE_PYTHON_RUNNER_DIR,
      }
    }
  }

  return {
    command: pythonBin,
    args: [PYTHON_RUNNER],
    cwd: path.join(REPO_ROOT, 'python', 'timetable_solver'),
  }
}

function runPythonSolver(input: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonBin = resolvePythonBin()
    const runner = resolveRunnerCommand(pythonBin)
    const child = spawn(runner.command, runner.args, {
      cwd: runner.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    // Timeout protection
    const timeoutId = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
      reject(new Error('Python solver timed out after 30 seconds'))
    }, SOLVER_TIMEOUT_MS)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      clearTimeout(timeoutId)
      reject(error)
    })

    child.on('close', (code) => {
      clearTimeout(timeoutId)
      if (timedOut) return // already rejected

      if (!stdout.trim()) {
        reject(new Error(stderr || `Python runner exited with code ${code}`))
        return
      }

      try {
        const parsed = JSON.parse(stdout)
        resolve(parsed)
      } catch (error) {
        reject(new Error(`Invalid Python runner JSON: ${error instanceof Error ? error.message : 'unknown error'}\n${stdout}\n${stderr}`))
      }
    })

    child.stdin.write(JSON.stringify(input))
    child.stdin.end()
  })
}

export async function POST(request: Request) {
  try {
    const input = await request.json()

    // Extract API key
    const apiKeyFromBody = typeof input?.apiKey === 'string' ? input.apiKey.trim() : ''
    const apiKey = apiKeyFromBody || request.headers.get('x-lowprizo-api-key')?.trim() || ''
    if (!apiKey) {
      return NextResponse.json({ error: 'Vui lòng nhập Lowprizo API key.' }, { status: 400 })
    }

    // 1. Build solver input skeleton + extract entities
    const solverInput = buildSolverInput(input)
    const entities = extractEntities(solverInput)

    // 2. Stage 1: AI Compiler
    const compilerPreview = buildCompilerPrompts({
      entities,
      rawConstraints: solverInput.rawConstraints,
    })
    const compileResult = await compileConstraintsWithAI(compilerPreview, apiKey)

    // 3. Inject compiled constraints into solver input
    solverInput.aiCompiledConstraints = compileResult.constraints
    solverInput.unparsedConstraints = compileResult.unparsed

    // 4. Run solver
    const solverResult = await runPythonSolver(solverInput)

    // 5. Stage 2: AI Verifier (only when solved)
    let verifierResult: VerifierResult = {
      violations: [],
      overallAssessment: '',
    }
    if (solverResult.status === 'solved') {
      verifierResult = await verifySolutionWithAI(
        {
          rawConstraints: solverInput.rawConstraints,
          cells: solverResult.cells || [],
          compiledConstraints: compileResult.constraints,
          entities,
        },
        apiKey,
      )
    }

    // 6. Logging (server-side only)
    console.log('[generate-timetable]', {
      rawCount: solverInput.rawConstraints.length,
      compiledCount: compileResult.constraints.length,
      unparsedCount: compileResult.unparsed.length,
      status: solverResult.status,
      iisSize: (solverResult.iisConstraintIds || []).length,
      violationCount: verifierResult.violations.length,
    })

    // 7. Combine and return response
    return NextResponse.json({
      status: solverResult.status,
      message: solverResult.message,
      diagnostics: solverResult.diagnostics ?? [],
      cells: solverResult.cells ?? [],
      compiledConstraints: compileResult.constraints,
      unparsedConstraints: compileResult.unparsed,
      executionErrors: solverResult.executionErrors ?? [],
      validationErrors: solverResult.validationErrors ?? [],
      iisConstraintIds: solverResult.iisConstraintIds ?? [],
      violations: verifierResult.violations,
      overallAssessment: verifierResult.overallAssessment,
      solverStats: solverResult.solverStats ?? null,
      modelRequestPreview: compilerPreview,
    } as TimetableSolveResult)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể tạo thời khóa biểu.'
    console.error('[generate-timetable] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
