import { spawn } from 'node:child_process'
import { existsSync, writeFileSync, unlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const SANDBOX_TIMEOUT_MS = 120_000

function resolvePythonBin(): string {
  if (process.env.TIMETABLE_PYTHON_BIN) return process.env.TIMETABLE_PYTHON_BIN
  const venvCandidates = [
    path.join(process.cwd(), '.venv', 'bin', 'python'),
    path.join(process.cwd(), '.venv', 'Scripts', 'python.exe'),
  ]
  for (const v of venvCandidates) {
    if (existsSync(v)) return v
  }
  return existsSync('/usr/bin/python3') ? 'python3' : 'python'
}

export type SandboxResult =
  | { success: true; data: SandboxOutput }
  | { success: false; error: string }

export type SandboxOutput = {
  status: 'ok' | 'infeasible' | 'error'
  cells: Array<{ assignmentId: string; slotId: string }>
  objective: number | null
  iisConstraintIds: string[]
  errorMessage: string | null
}

export function runCodeInSandbox(code: string, payload: unknown): Promise<SandboxResult> {
  return new Promise((resolve) => {
    const tmpFile = path.join(os.tmpdir(), `timetable_${randomUUID()}.py`)

    try {
      writeFileSync(tmpFile, code, 'utf8')
    } catch (e) {
      resolve({ success: false, error: `Failed to write temp file: ${e}` })
      return
    }

    const pythonBin = resolvePythonBin()
    const child = spawn(pythonBin, [tmpFile], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timeoutId = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
      resolve({ success: false, error: `Sandbox timed out after ${SANDBOX_TIMEOUT_MS / 1000}s` })
    }, SANDBOX_TIMEOUT_MS)

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    child.on('error', (error: Error) => {
      clearTimeout(timeoutId)
      try { unlinkSync(tmpFile) } catch { /* ignore */ }
      resolve({ success: false, error: error.message })
    })

    child.on('close', () => {
      clearTimeout(timeoutId)
      try { unlinkSync(tmpFile) } catch { /* ignore */ }
      if (timedOut) return

      const output = stdout.trim()
      if (!output) {
        resolve({ success: false, error: `No output from sandbox.\nstderr: ${stderr}` })
        return
      }

      // Find the last line that looks like JSON (LLM code might print debug info)
      const lines = output.split('\n')
      const jsonLine = [...lines].reverse().find(l => l.trim().startsWith('{'))
      if (!jsonLine) {
        resolve({ success: false, error: `No JSON found in output:\n${output}\nstderr: ${stderr}` })
        return
      }

      try {
        const parsed = JSON.parse(jsonLine) as SandboxOutput
        resolve({ success: true, data: parsed })
      } catch {
        resolve({ success: false, error: `Invalid JSON output: ${jsonLine}\nstderr: ${stderr}` })
      }
    })

    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
  })
}

export type CompiledConstraint = {
  id: string
  code: string
  priority: 'hard' | 'soft'
}

export type SolverProblem = {
  slots: Array<{
    slotId: string
    dayId: string
    dayLabel: string
    sessionId: string
    sessionLabel: string
    period: number
  }>
  assignments: Array<{
    assignmentId: string
    teacherId: string
    teacherLabel: string
    classId: string
    classLabel: string
    subjectId: string
    subjectLabel: string
    weeklyPeriods: number
  }>
  aiCompiledConstraints: CompiledConstraint[]
  solverConfig: {
    maxTimeSeconds: number
    numWorkers: number
    randomSeed: number
  }
}

export type SolverDirectResult =
  | { success: true; data: SolverDirectOutput }
  | { success: false; error: string }

export type SolverDirectOutput = {
  status: 'solved' | 'infeasible' | 'error'
  message: string
  diagnostics: string[]
  cells: import('@/features/timetable/ai/types').TimetableSolveCell[]
  iisConstraintIds: string[]
  executionErrors: Array<{ constraintId: string; error: string }>
  validationErrors: Array<{ constraintId: string; error: string }>
  solverStats: {
    wallTimeSeconds: number
    objectiveValue: number | null
    bestBound: number | null
    numConflicts: number
    numBranches: number
  } | null
}

export function runSolverDirect(problem: SolverProblem): Promise<SolverDirectResult> {
  return new Promise((resolve) => {
    const runnerPath = path.join(process.cwd(), 'python', 'timetable_solver', 'runner.py')
    if (!existsSync(runnerPath)) {
      resolve({ success: false, error: `runner.py not found at ${runnerPath}` })
      return
    }

    const pythonBin = resolvePythonBin()
    const child = spawn(pythonBin, [runnerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timeoutMs = Math.max((problem.solverConfig.maxTimeSeconds + 15) * 1000, 60_000)
    const timeoutId = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
      resolve({ success: false, error: `Solver timed out after ${timeoutMs / 1000}s` })
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    child.on('error', (error: Error) => {
      clearTimeout(timeoutId)
      resolve({ success: false, error: error.message })
    })

    child.on('close', () => {
      clearTimeout(timeoutId)
      if (timedOut) return
      const output = stdout.trim()
      if (!output) {
        resolve({ success: false, error: `No output from solver.\nstderr: ${stderr}` })
        return
      }
      try {
        const parsed = JSON.parse(output) as SolverDirectOutput
        resolve({ success: true, data: parsed })
      } catch {
        resolve({ success: false, error: `Invalid JSON from solver: ${output.slice(0, 200)}\nstderr: ${stderr}` })
      }
    })

    child.stdin.write(JSON.stringify(problem))
    child.stdin.end()
  })
}
