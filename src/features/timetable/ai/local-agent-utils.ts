import os from 'node:os';
import type { ConstraintSpec } from './constraint-spec';
import type { AgentEvent, LocalAgentConfig } from './types';

export type SolverRuntimeConfig = { timeoutMs: number; workers: number };

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

export function resolveSolverRuntime(config: LocalAgentConfig): SolverRuntimeConfig {
  const cpuCount = getAvailableCpuCount();
  const profile = config.solverProfile ?? 'balanced';
  const defaults: Record<string, SolverRuntimeConfig> = {
    fast: { timeoutMs: 20_000, workers: Math.max(1, Math.floor(cpuCount / 2)) },
    balanced: { timeoutMs: 60_000, workers: Math.max(1, cpuCount - 1) },
    deep: { timeoutMs: 180_000, workers: cpuCount },
  };
  const resolved = defaults[profile] ?? defaults.balanced;
  return {
    timeoutMs: config.timeoutMs ?? resolved.timeoutMs,
    workers: Math.min(8, Math.max(1, Math.floor(config.solverWorkers ?? resolved.workers))),
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
