import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { GeneratedSolverArtifact } from '@/features/timetable/ai/types'

const GENERATED_DIR = path.join(process.cwd(), 'python', 'timetable_solver', 'generated')
const BASE_TEMPLATE_PATH = path.join(process.cwd(), 'python', 'timetable_solver', 'base_solver_template.py')

export function ensureGeneratedSolverDir() {
  if (!existsSync(GENERATED_DIR)) mkdirSync(GENERATED_DIR, { recursive: true })
  return GENERATED_DIR
}

export function getBaseSolverTemplatePath() {
  return BASE_TEMPLATE_PATH
}

export function readBaseSolverTemplate() {
  return readFileSync(BASE_TEMPLATE_PATH, 'utf8')
}

export function getGeneratedSolverArtifactPath() {
  ensureGeneratedSolverDir()
  return path.join(GENERATED_DIR, 'generated_solver.py')
}

export function persistGeneratedSolverArtifact(input: {
  solverCode: string
  entrypoint: string
  summary: string
  assumptions?: string[]
}): GeneratedSolverArtifact {
  const artifactPath = getGeneratedSolverArtifactPath()
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
