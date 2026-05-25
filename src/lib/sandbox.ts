import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, realpathSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
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

export function getSandboxLogPath(solverArtifactPath?: string) {
  if (!solverArtifactPath) return null
  const requestId = path.basename(path.dirname(solverArtifactPath))
  return getGeneratedSolverWorkspace(requestId).logPath
}

function writeSandboxLog(request: SolverExecutionRequest, content: string) {
  const requestId = request.solverArtifactPath
    ? path.basename(path.dirname(request.solverArtifactPath))
    : `direct-${randomUUID()}`
  const workspace = getGeneratedSolverWorkspace(requestId)
  writeFileSync(workspace.logPath, content, 'utf8')
}

function buildSandboxEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: process.env.PATH || '',
    SYSTEMROOT: process.env.SYSTEMROOT || '',
    HOME: os.tmpdir(),
    TMPDIR: os.tmpdir(),
    TEMP: os.tmpdir(),
    TMP: os.tmpdir(),
    PYTHONPATH: resolvePythonPath(),
    PYTHONNOUSERSITE: '1',
    PYTHONDONTWRITEBYTECODE: '1',
    TIMETABLE_SANDBOX_MODE: '1',
  }
}

function validateArtifactPath(solverArtifactPath?: string) {
  if (!solverArtifactPath) {
    return null
  }

  const requestId = path.basename(path.dirname(solverArtifactPath))
  const workspace = getGeneratedSolverWorkspace(requestId)

  try {
    const resolvedArtifactPath = realpathSync(solverArtifactPath)
    const resolvedWorkspaceDir = realpathSync(workspace.rootDir)
    const expectedArtifactPath = path.join(resolvedWorkspaceDir, 'generated_solver.py')

    if (resolvedArtifactPath !== expectedArtifactPath) {
      return 'Solver artifact path is outside the sandbox workspace.'
    }
  } catch {
    return 'Solver artifact path could not be resolved inside sandbox workspace.'
  }

  return null
}

export function runSolverDirect(request: SolverProblem | SolverExecutionRequest): Promise<SolverDirectResult> {
  return new Promise((resolve) => {
    const runnerPath = resolveRunnerPath()
    if (!existsSync(runnerPath)) {
      resolve({ success: false, error: `runner.py not found at ${runnerPath}` })
      return
    }

    const actualRequest: SolverExecutionRequest = 'problem' in request
      ? request
      : { problem: request }

    const artifactPathError = validateArtifactPath(actualRequest.solverArtifactPath)
    if (artifactPathError) {
      writeSandboxLog(actualRequest, artifactPathError)
      resolve({ success: false, error: artifactPathError })
      return
    }

      const pythonBin = resolvePythonBin()
      const child: ChildProcessWithoutNullStreams = spawn(pythonBin, [runnerPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: actualRequest.solverArtifactPath
          ? path.dirname(actualRequest.solverArtifactPath)
          : os.tmpdir(),
        env: buildSandboxEnv(),
      })


    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timeoutMs = Math.min(
      SANDBOX_TIMEOUT_MS,
      Math.max((actualRequest.problem.solverConfig.maxTimeSeconds + 15) * 1000, 60_000),
    )
    const timeoutId = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
      writeSandboxLog(actualRequest, `timeout after ${timeoutMs / 1000}s`)
      resolve({ success: false, error: `Solver timed out after ${timeoutMs / 1000}s` })
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    child.on('error', (error: Error) => {
      clearTimeout(timeoutId)
      writeSandboxLog(actualRequest, `spawn_error\n${error.message}`)
      resolve({ success: false, error: error.message })
    })

    child.on('close', () => {
      clearTimeout(timeoutId)
      if (timedOut) return
      const output = stdout.trim()
      writeSandboxLog(actualRequest, [`stdout`, stdout.trim(), '', 'stderr', stderr.trim()].join('\n'))
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
