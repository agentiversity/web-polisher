/**
 * Bounded LRU result cache (design D3).
 *
 * Lives in the background (storage.local, single key) so the content script
 * never touches it and hits are shared across tabs. Keyed by the exact original
 * text; entries carry a write timestamp for TTL expiry and LRU ordering.
 *
 * Failures degrade to "no cache": any storage read/write error is swallowed so
 * the cache can never break the transform pipeline.
 */
import { browser } from 'wxt/browser';
import { CACHE_KEY, CACHE_MAX_ENTRIES, CACHE_TTL_MS } from './settings';

export interface CacheRecord {
  polished: string;
  ts: number;
  /** Quality-gate confidence score (0–100) captured when the result was stored. */
  confidence?: number;
}

export type PolishCache = Record<string, CacheRecord>;

/** Drop expired entries, then evict least-recently-used past the cap. */
export function pruneCache(map: PolishCache, now: number = Date.now()): PolishCache {
  const out: PolishCache = {};
  for (const [k, v] of Object.entries(map)) {
    if (v && typeof v.polished === 'string' && typeof v.ts === 'number' && now - v.ts < CACHE_TTL_MS) {
      out[k] = v;
    }
  }
  const keys = Object.keys(out);
  if (keys.length <= CACHE_MAX_ENTRIES) return out;
  keys.sort((a, b) => out[a]!.ts - out[b]!.ts);
  for (let i = 0; i < keys.length - CACHE_MAX_ENTRIES; i++) delete out[keys[i]!];
  return out;
}

/** Read and prune the cache from storage.local; empty map on any failure. */
export async function loadCache(): Promise<PolishCache> {
  try {
    const got = await browser.storage.local.get(CACHE_KEY);
    const raw = got[CACHE_KEY];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return pruneCache(raw as PolishCache);
    }
  } catch {
    // Storage unavailable — treat as empty cache.
  }
  return {};
}

/** Prune and persist the cache; never throws. */
export async function saveCache(map: PolishCache): Promise<void> {
  try {
    await browser.storage.local.set({ [CACHE_KEY]: pruneCache(map) });
  } catch {
    // Never let a cache write failure break the transform.
  }
}

/** Cached polished text for `text` if present and unexpired; bumps its LRU time. */
export function getCached(map: PolishCache, text: string, now: number = Date.now()): CacheRecord | undefined {
  const rec = map[text];
  if (!rec || typeof rec.polished !== 'string' || now - rec.ts >= CACHE_TTL_MS) return undefined;
  rec.ts = now; // touch for LRU ordering (persisted on the next saveCache)
  return rec;
}

/** Store a polished result for `text`. */
export function setCached(map: PolishCache, text: string, polished: string, confidence?: number, now: number = Date.now()): void {
  map[text] = { polished, ts: now, confidence };
}
