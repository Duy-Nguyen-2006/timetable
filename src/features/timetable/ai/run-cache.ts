import type { AIProviderConfig, AgentInputPayload } from './types'
import { PIPELINE_VERSIONS } from './pipeline-versions'
import { __localAgentInternal } from './local-agent'
import type { CachedRun, TimetableSolveResult } from '../types'
import { MAX_CACHED_RUNS } from '../solver-ui'

export const RUN_CACHE_STORAGE_KEY = 'tack_ai_run_cache'

export const buildRunCacheDigest = (input: AgentInputPayload, provider: AIProviderConfig) =>
  __localAgentInternal.stableHash({
    input,
    provider: provider.provider,
    baseURL: provider.baseURL,
    model: provider.model,
    modelTranslator: provider.modelTranslator,
    modelPlanner: provider.modelPlanner,
    modelCoder: provider.modelCoder,
    modelRepair: provider.modelRepair,
    solverProfile: provider.solverProfile,
    solverRuntimeMode: provider.solverRuntimeMode,
    versions: PIPELINE_VERSIONS,
  })

export const readCachedRuns = (): CachedRun[] => {
  try {
    const raw = localStorage.getItem(RUN_CACHE_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.slice(0, MAX_CACHED_RUNS) : []
  } catch {
    return []
  }
}

export const writeCachedRun = (inputDigest: string, result: TimetableSolveResult) => {
  try {
    const nextRuns = [
      { id: crypto.randomUUID(), createdAt: new Date().toISOString(), inputDigest, result },
      ...readCachedRuns().filter((run) => run.inputDigest !== inputDigest),
    ].slice(0, MAX_CACHED_RUNS)
    localStorage.setItem(RUN_CACHE_STORAGE_KEY, JSON.stringify(nextRuns))
  } catch {}
}
