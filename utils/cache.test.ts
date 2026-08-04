// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCached, loadCache, pruneCache, saveCache, setCached, type PolishCache } from './cache';
import { CACHE_KEY, CACHE_MAX_ENTRIES, CACHE_TTL_MS } from './settings';

const mocks = vi.hoisted(() => {
  let store: Record<string, unknown> = {};
  return {
    get: vi.fn(async (k: string) => ({ [k]: store[k] })),
    set: vi.fn(async (obj: Record<string, unknown>) => {
      Object.assign(store, obj);
    }),
    seed: (obj: Record<string, unknown>) => {
      store = { ...obj };
    },
    clear: () => {
      store = {};
    },
  };
});

vi.mock('wxt/browser', () => ({
  browser: { storage: { local: { get: mocks.get, set: mocks.set } } },
}));

beforeEach(() => {
  mocks.clear();
  mocks.get.mockClear();
  mocks.set.mockClear();
});

describe('getCached / setCached', () => {
  it('returns nothing for a missing key', () => {
    expect(getCached({}, 'hello world')).toBeUndefined();
  });

  it('returns the stored polish for a fresh entry and touches its LRU time', () => {
    const map: PolishCache = {};
    setCached(map, 'original text', 'polished text', 1000);
    expect(getCached(map, 'original text', 2000)).toBe('polished text');
    expect(map['original text']!.ts).toBe(2000);
  });

  it('treats an expired entry as a miss', () => {
    const map: PolishCache = {};
    setCached(map, 'original text', 'polished text', 1000);
    expect(getCached(map, 'original text', 1000 + CACHE_TTL_MS)).toBeUndefined();
  });

  it('treats a malformed record as a miss', () => {
    const map = { 'original text': { polished: 123, ts: 0 } } as unknown as PolishCache;
    expect(getCached(map, 'original text')).toBeUndefined();
  });
});

describe('pruneCache', () => {
  it('drops expired entries', () => {
    const now = 10_000_000;
    const map: PolishCache = {
      old: { polished: 'x', ts: now - CACHE_TTL_MS - 1 },
      fresh: { polished: 'y', ts: now },
    };
    const pruned = pruneCache(map, now);
    expect(Object.keys(pruned)).toEqual(['fresh']);
  });

  it('evicts least-recently-used entries beyond the cap', () => {
    const now = 10_000;
    const map: PolishCache = {};
    for (let i = 0; i < CACHE_MAX_ENTRIES + 10; i++) {
      map[`text ${i}`] = { polished: `p ${i}`, ts: now - (CACHE_MAX_ENTRIES + 10 - i) };
    }
    const pruned = pruneCache(map, now);
    expect(Object.keys(pruned)).toHaveLength(CACHE_MAX_ENTRIES);
    // The 10 oldest keys were evicted.
    expect(pruned['text 0']).toBeUndefined();
    expect(pruned['text 9']).toBeUndefined();
    expect(pruned['text 10']).toBeDefined();
  });
});

describe('loadCache / saveCache (persistence)', () => {
  it('round-trips a map through storage.local', async () => {
    const map: PolishCache = { 'some text': { polished: 'nice text', ts: Date.now() } };
    await saveCache(map);
    const loaded = await loadCache();
    expect(loaded['some text']).toEqual({ polished: 'nice text', ts: map['some text']!.ts });
  });

  it('returns an empty map when nothing is stored', async () => {
    await expect(loadCache()).resolves.toEqual({});
  });

  it('is resilient to corrupt stored data', async () => {
    mocks.seed({ [CACHE_KEY]: 'garbage-not-an-object' });
    await expect(loadCache()).resolves.toEqual({});
    mocks.seed({ [CACHE_KEY]: [1, 2, 3] });
    await expect(loadCache()).resolves.toEqual({});
  });

  it('never throws when storage reads or writes fail', async () => {
    mocks.get.mockRejectedValue(new Error('storage down'));
    await expect(loadCache()).resolves.toEqual({});
    mocks.get.mockResolvedValue({});
    mocks.set.mockRejectedValue(new Error('storage down'));
    await expect(saveCache({ 'text': { polished: 'p', ts: 0 } })).resolves.toBeUndefined();
  });
});
