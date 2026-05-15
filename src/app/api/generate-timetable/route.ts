import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { NextResponse } from 'next/server'

import { normalizeConstraintsWithDevstral } from '@/features/timetable/ai/devstral'
import { buildDevstralRequestPreview, buildSolverInput } from '@/features/timetable/ai/normalize'
import type { TimetableSolveResult } from '@/features/timetable/ai/types'

const REPO_ROOT = process.cwd()
const PYTHON_RUNNER = path.join(REPO_ROOT, 'python', 'timetable_solver', 'runner.py')

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

function runPythonSolver(input: Record<string, unknown>): Promise<TimetableSolveResult> {
  return new Promise((resolve, reject) => {
    const pythonBin = resolvePythonBin()
    const runner = resolveRunnerCommand(pythonBin)
    const child = spawn(runner.command, runner.args, {
      cwd: runner.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      if (!stdout.trim()) {
        reject(new Error(stderr || `Python runner exited with code ${code}`))
        return
      }

      try {
        const parsed = JSON.parse(stdout) as TimetableSolveResult
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
    const modelRequestPreview = buildDevstralRequestPreview(input)
    const normalizedConstraints = await normalizeConstraintsWithDevstral(modelRequestPreview)
    const solverInput = buildSolverInput(input)
    solverInput.constraints = {
      ...solverInput.constraints,
      hard: normalizedConstraints.hard,
      soft: normalizedConstraints.soft,
      rawText: solverInput.constraints.rawText,
      unparsed: normalizedConstraints.unparsed,
    }

    const result = await runPythonSolver(solverInput)

    return NextResponse.json({
      status: result.status,
      message: result.message,
      cells: result.cells,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể tạo thời khóa biểu.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
