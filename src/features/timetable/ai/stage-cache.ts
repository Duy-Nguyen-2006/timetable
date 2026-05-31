import { STAGE_CACHE_MAX_ENTRIES, STAGE_CACHE_TTL_MS } from './local-agent-limits';

interface StageCacheEntry {
  value: unknown;
  expiresAt: number;
}

const stageCache = new Map<string, StageCacheEntry>();

export async function getCachedStage<T>(key: string, producer: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  const now = Date.now();
  const entry = stageCache.get(key);
  if (entry && entry.expiresAt > now) {
    return { value: entry.value as T, hit: true };
  }
  const value = await producer();
  stageCache.set(key, { value, expiresAt: now + STAGE_CACHE_TTL_MS });
  if (stageCache.size > STAGE_CACHE_MAX_ENTRIES) {
    let evictKey: string | undefined;
    let minExpiry = Infinity;
    for (const [k, v] of stageCache) {
      if (v.expiresAt < minExpiry) { minExpiry = v.expiresAt; evictKey = k; }
    }
    if (evictKey) stageCache.delete(evictKey);
  }
  return { value, hit: false };
}
