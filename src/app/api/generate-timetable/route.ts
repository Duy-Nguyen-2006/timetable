import { spawn } from 'node:child_process'
import path from 'node:path'

import { NextResponse } from 'next/server'

import { normalizeConstraintsWithDevstral } from '@/features/timetable/ai/devstral'
import { buildDevstralRequestPreview, buildSolverInput } from '@/features/timetable/ai/normalize'
import type { TimetableSolveResult } from '@/features/timetable/ai/types'

const PYTHON_BIN = process.env.TIMETABLE_PYTHON_BIN || 'python3'
const PYTHON_RUNNER = path.join(process.cwd(), 'python', 'timetable_solver', 'runner.py')

function runPythonSolver(input: Record<string, unknown>): Promise<TimetableSolveResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [PYTHON_RUNNER], {
      cwd: path.join(process.cwd(), 'python', 'timetable_solver'),
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
      ...result,
      normalizedConstraints,
      modelRequestPreview,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể tạo thời khóa biểu.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
