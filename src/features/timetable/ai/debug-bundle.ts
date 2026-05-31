// Debug bundle gatherer (#17). Collects per-run artifacts from a workspace dir
// produced by code_executor + the in-memory pipeline state, returning a single
// JSON-serializable object the renderer can offer as a download.

import type { AgentInputPayload } from './types'
import type { ConstraintSpec, Plan, Violation } from './constraint-spec'
import { PIPELINE_VERSIONS } from './pipeline-versions'

export interface DebugBundleSnapshot {
  inputDigest?: string
  compressedPayload?: unknown
  translatorOutput?: { constraintSpecs: ConstraintSpec[]; rawText?: string }
  plannerOutput?: Plan
  generatedSolver?: string
  executionResult?: unknown
  validationReport?: { violations: Violation[]; ok: boolean }
  finalResult?: unknown
}

export interface DebugBundle extends DebugBundleSnapshot {
  generatedAt: string
  versions: typeof PIPELINE_VERSIONS
  input?: AgentInputPayload
}

export function buildDebugBundle(opts: {
  input?: AgentInputPayload
  snapshot: DebugBundleSnapshot
}): DebugBundle {
  return {
    generatedAt: new Date().toISOString(),
    versions: PIPELINE_VERSIONS,
    input: opts.input,
    ...opts.snapshot,
  }
}

export function debugBundleFilename(prefix = 'tack-debug'): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${prefix}-${stamp}.json`
}

export function downloadDebugBundle(bundle: DebugBundle): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = debugBundleFilename()
  a.click()
  URL.revokeObjectURL(url)
}
