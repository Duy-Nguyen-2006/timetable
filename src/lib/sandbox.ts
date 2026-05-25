import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { getGeneratedSolverWorkspace } from '@/lib/generated-solver-artifacts'

const SANDBOX_TIMEOUT_MS = 120_000

function getPackagedPythonSourceDir() {
  const runnerDir = process.env.TIMETABLE_PYTHON_RUNNER_DIR
  if (!runnerDir) return null
  const candidate = path.resolve(runnerDir, '..', 'python-src', 'timetable_solver')
  return existsSync(candidate) ? candidate : null
}

function resolveRunnerPath(): string {
  const packagedRunner = getPackagedPythonSourceDir()
  if (packagedRunner) return path.join(packagedRunner, 'runner.py')
  return path.join(process.cwd(), 'python', 'timetable_solver', 'runner.py')
}

function resolvePythonPath() {
  const packagedRunner = getPackagedPythonSourceDir()
  if (packagedRunner) return path.resolve(packagedRunner, '..')
  return path.join(process.cwd(), 'python')
}

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
  hardConstraints: Array<{ id: string; text: string }>
  softConstraints: Array<{ id: string; text: string; weight: number }>
  solverConfig: {
    maxTimeSeconds: number
    numWorkers: number
    randomSeed: number
  }
}

export type SolverDirectResult =
  | { success: true; data: SolverDirectOutput }
  | { success: false; error: string }

export type SolverExecutionRequest = {
  problem: SolverProblem
  solverArtifactPath?: string
  entrypoint?: string
}

export type SolverDirectOutput = import('@/features/timetable/ai/types').SolverExecutionOutput

function writeSandboxLog(request: SolverExecutionRequest, content: string) {
  const workspace = getGeneratedSolverWorkspace(request.solverArtifactPath ? path.basename(path.dirname(request.solverArtifactPath)) : undefined)
  writeFileSync(workspace.logPath, content, 'utf8')
}

export function runSolverDirect(request: SolverProblem | SolverExecutionRequest): Promise<SolverDirectResult> {
  return new Promise((resolve) => {
    const runnerPath = resolveRunnerPath()
    if (!existsSync(runnerPath)) {
      resolve({ success: false, error: `runner.py not found at ${runnerPath}` })
      return
    }

    const pythonBin = resolvePythonBin()
    const child = spawn(pythonBin, [runnerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONPATH: [resolvePythonPath(), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      },
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const actualRequest: SolverExecutionRequest = 'problem' in request
      ? request
      : { problem: request }

    const timeoutMs = Math.max((actualRequest.problem.solverConfig.maxTimeSeconds + 15) * 1000, 60_000)
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

    child.stdin.write(JSON.stringify(actualRequest))
    child.stdin.end()
  })
}
