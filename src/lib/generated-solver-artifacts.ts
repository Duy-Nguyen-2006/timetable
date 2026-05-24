import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { GeneratedSolverArtifact } from '@/features/timetable/ai/types'

function getPackagedPythonSourceDir() {
  const runnerDir = process.env.TIMETABLE_PYTHON_RUNNER_DIR
  if (!runnerDir) return null
  return path.resolve(runnerDir, '..', 'python-src', 'timetable_solver')
}

function getPythonSourceDir() {
  const packagedDir = getPackagedPythonSourceDir()
  if (packagedDir && existsSync(packagedDir)) return packagedDir
  return path.join(process.cwd(), 'python', 'timetable_solver')
}

const GENERATED_DIR = path.join(os.tmpdir(), 'tack-timetable-generated')
const BASE_TEMPLATE_PATH = path.join(getPythonSourceDir(), 'base_solver_template.py')

export function ensureGeneratedSolverDir(requestId?: string) {
  const dir = requestId ? path.join(GENERATED_DIR, requestId) : GENERATED_DIR
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function getBaseSolverTemplatePath() {
  return BASE_TEMPLATE_PATH
}

export function readBaseSolverTemplate() {
  return readFileSync(BASE_TEMPLATE_PATH, 'utf8')
}

export function getGeneratedSolverArtifactPath(requestId?: string) {
  const dir = ensureGeneratedSolverDir(requestId)
  return path.join(dir, 'generated_solver.py')
}

export function persistGeneratedSolverArtifact(
  input: {
    solverCode: string
    entrypoint: string
    summary: string
    assumptions?: string[]
  },
  requestId?: string,
): GeneratedSolverArtifact {
  const artifactPath = getGeneratedSolverArtifactPath(requestId)
  writeFileSync(artifactPath, input.solverCode, 'utf8')

  return {
    path: artifactPath,
    solverCode: input.solverCode,
    entrypoint: input.entrypoint,
    summary: input.summary,
    assumptions: input.assumptions ?? [],
    sourceHash: createHash('sha256').update(input.solverCode).digest('hex'),
  }
}

export function cleanupSolverArtifact(requestId: string) {
  const dir = path.join(GENERATED_DIR, requestId)
  try {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  } catch {
    // cleanup failure is non-fatal
  }
}
