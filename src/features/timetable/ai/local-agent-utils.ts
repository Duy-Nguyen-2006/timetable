import os from 'node:os';
import type { ConstraintSpec } from './constraint-spec';
import type { AgentEvent, LocalAgentConfig } from './types';

export type SolverRuntimeConfig = { timeoutMs: number; workers: number; seed: number };

/**
 * Section 14.8: Solver determinism. The seed is derived from the constraint
 * specs hash so that the same input always produces the same output.
 */
export const DEFAULT_SOLVER_SEED = 42;
export const SOLVER_SEED_SALT = 0x5e2d3a91;

export function deriveSolverSeed(specs: readonly { id: string; kind: string; params: Record<string, unknown> }[]): number {
  const sorted = [...specs].sort((a, b) => a.id.localeCompare(b.id));
  let h = 0x811c9dc5;
  for (const spec of sorted) {
    const payload = JSON.stringify({ k: spec.kind, p: sortObjectDeep(spec.params) });
    for (let i = 0; i < payload.length; i += 1) {
      h ^= payload.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return ((h ^ SOLVER_SEED_SALT) >>> 0) & 0x7fffffff;
}

export function emit(config: LocalAgentConfig, event: AgentEvent) {
  config.onEvent?.(event);
}

export function getAvailableCpuCount(): number {
  if (typeof navigator !== 'undefined' && Number(navigator.hardwareConcurrency) > 0) {
    return Number(navigator.hardwareConcurrency);
  }
  // Browser bundles polyfilled by Next.js handle `node:os` as a noop
  // (returns undefined), so the fallback below only runs in real Node
  // (CLI/test scripts).
  return (os?.cpus?.() ?? []).length || 2;
}

export function resolveSolverRuntime(config: LocalAgentConfig, specs?: ConstraintSpec[]): SolverRuntimeConfig {
  const cpuCount = getAvailableCpuCount();
  const profile = config.solverProfile ?? 'balanced';
  const defaults: Record<string, SolverRuntimeConfig> = {
    fast: { timeoutMs: 20_000, workers: Math.max(1, Math.floor(cpuCount / 2)), seed: DEFAULT_SOLVER_SEED },
    balanced: { timeoutMs: 60_000, workers: Math.max(1, cpuCount - 1), seed: DEFAULT_SOLVER_SEED },
    deep: { timeoutMs: 180_000, workers: cpuCount, seed: DEFAULT_SOLVER_SEED },
  };
  const resolved = defaults[profile] ?? defaults.balanced;
  // Section 14.8: same input → same seed for reproducible solver runs
  const seed = specs && specs.length > 0 ? deriveSolverSeed(specs) : resolved.seed;
  return {
    timeoutMs: config.timeoutMs ?? resolved.timeoutMs,
    workers: Math.min(8, Math.max(1, Math.floor(config.solverWorkers ?? resolved.workers))),
    seed,
  };
}

export function buildFinalMessage(status: string | undefined): string {
  if (status === 'optimal') return 'Đã tạo thời khóa biểu tối ưu.';
  if (status === 'feasible') return 'Đã tìm được lịch hợp lệ, nhưng chưa chứng minh là tối ưu.';
  return 'Đã tạo thời khóa biểu thành công.';
}

export function sortObjectDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectDeep);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortObjectDeep(item)])
  );
}

export function stableHash(value: unknown): string {
  return JSON.stringify(sortObjectDeep(value));
}

/**
 * Real FNV-1a 32-bit hash, hex-encoded. Use this for cache keys where we
 * want a bounded-length fingerprint instead of a multi-KB JSON string.
 * Browser- and Node-safe (no Web Crypto needed, fully sync).
 */
function fnv1a32(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Deterministic, bounded-length cache key. Sorts object keys deeply before
 * hashing so structurally-equal inputs (key order aside) collide.
 */
export function hashKey(value: unknown): string {
  return fnv1a32(stableHash(value));
}

export function constraintSignature(spec: ConstraintSpec): string {
  return JSON.stringify({
    kind: spec.kind,
    severity: spec.severity,
    params: sortObjectDeep(spec.params),
    weight: spec.weight ?? null,
    pythonPredicate: spec.pythonPredicate ?? null,
  });
}

export function dedupeConstraintSpecs(specs: ConstraintSpec[]): ConstraintSpec[] {
  const seen = new Set<string>();
  return specs.filter((spec) => {
    const sig = constraintSignature(spec);
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}
