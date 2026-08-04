// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  adaptIndex,
  BUNDLED_PROVIDERS,
  clearProviderIndexCache,
  fetchProviderIndex,
  getProviderModels,
  isValidCustomUrl,
  isValidModelId,
  normalizeBaseUrl,
  sortProviders,
  type ProviderDef,
} from './providers';
import { PROVIDERS_INDEX_CACHE_KEY } from './settings';

const mocks = vi.hoisted(() => {
  const store = {} as Record<string, unknown>;
  return {
    get: vi.fn(async (k: string) => ({ [k]: store[k] })),
    set: vi.fn(async (obj: Record<string, unknown>) => Object.assign(store, obj)),
    remove: vi.fn(async (k: string) => {
      delete store[k];
    }),
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    fetchMock: vi.fn(),
  };
});

vi.mock('wxt/browser', () => ({
  browser: { storage: { local: { get: mocks.get, set: mocks.set, remove: mocks.remove } } },
}));

beforeEach(() => {
  mocks.clear();
  mocks.get.mockClear();
  mocks.set.mockClear();
  mocks.remove.mockClear();
  mocks.fetchMock.mockReset();
  vi.stubGlobal('fetch', mocks.fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('adaptIndex (models.dev schema)', () => {
  const raw = {
    openai: { id: 'openai', name: 'OpenAI', npm: '@ai-sdk/openai', models: { 'gpt-4o-mini': { id: 'gpt-4o-mini' } } },
    anthropic: { id: 'anthropic', name: 'Anthropic', npm: '@ai-sdk/anthropic', models: {} },
    google: { id: 'google', name: 'Google', npm: '@ai-sdk/google', models: {} },
    groq: { id: 'groq', name: 'Groq', npm: '@ai-sdk/groq', models: {} },
    deepseek: { id: 'deepseek', name: 'DeepSeek', npm: '@ai-sdk/openai-compatible', api: 'https://api.deepseek.com', models: {} },
    bedrock: { id: 'bedrock', name: 'Bedrock', npm: '@ai-sdk/amazon-bedrock', models: {} },
    neon: { id: 'neon', name: 'Neon', npm: '@ai-sdk/openai-compatible', api: '${NEON_AI_GATEWAY_BASE_URL}/v1', models: {} },
  } as never;

  it('maps supported npm packages to compat and resolves default base URLs', () => {
    const out = adaptIndex(raw);
    const byId = Object.fromEntries(out.map((p) => [p.id, p]));
    expect(byId.openai).toMatchObject({ apiCompatibility: 'openai', baseUrl: 'https://api.openai.com/v1' });
    expect(byId.anthropic).toMatchObject({ apiCompatibility: 'anthropic', baseUrl: 'https://api.anthropic.com/v1' });
    expect(byId.google).toMatchObject({ apiCompatibility: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com' });
    expect(byId.groq).toMatchObject({ apiCompatibility: 'openai', baseUrl: 'https://api.groq.com/openai/v1' });
  });

  it('normalizes a bare-host api url to /v1 for openai compat', () => {
    const out = adaptIndex(raw);
    expect(out.find((p) => p.id === 'deepseek')?.baseUrl).toBe('https://api.deepseek.com/v1');
  });

  it('drops unsupported wire formats and env-templated urls', () => {
    const out = adaptIndex(raw);
    expect(out.some((p) => p.id === 'bedrock')).toBe(false);
    expect(out.some((p) => p.id === 'neon')).toBe(false);
  });

  it('carries the provider model ids from the index', () => {
    const out = adaptIndex(raw);
    expect(out.find((p) => p.id === 'openai')?.models).toEqual(['gpt-4o-mini']);
  });
});

describe('sortProviders', () => {
  it('sorts alphabetically by display name', () => {
    const list: ProviderDef[] = [
      { id: 'xai', name: 'xAI', baseUrl: 'x', apiCompatibility: 'openai' },
      { id: 'openai', name: 'OpenAI', baseUrl: 'x', apiCompatibility: 'openai' },
      { id: 'groq', name: 'Groq', baseUrl: 'x', apiCompatibility: 'openai' },
    ];
    expect(sortProviders(list).map((p) => p.name)).toEqual(['Groq', 'OpenAI', 'xAI']);
  });
});

describe('normalizeBaseUrl', () => {
  it('appends /v1 for openai/anthropic when missing', () => {
    expect(normalizeBaseUrl('https://api.deepseek.com', 'openai')).toBe('https://api.deepseek.com/v1');
    expect(normalizeBaseUrl('https://api.deepseek.com/v1', 'openai')).toBe('https://api.deepseek.com/v1');
  });
  it('leaves gemini roots untouched', () => {
    expect(normalizeBaseUrl('https://generativelanguage.googleapis.com/', 'gemini')).toBe('https://generativelanguage.googleapis.com');
  });
});

describe('isValidModelId', () => {
  it('accepts real-world model ids', () => {
    for (const id of ['gpt-4o-mini', 'llama3.1:8b', 'google/gemma-2-27b', 'gemini-2.5-flash-preview-05-20', 'accounts/fireworks/models/llama-v3p3-70b']) {
      expect(isValidModelId(id)).toBe(true);
    }
  });
  it('rejects uppercase, whitespace, and symbols', () => {
    for (const id of ['GPT-4o', 'has space', 'bad!', '', '-leading', 'a_underscore']) {
      expect(isValidModelId(id)).toBe(false);
    }
  });
});

describe('isValidCustomUrl', () => {
  it('accepts https /v1 for openai/anthropic', () => {
    expect(isValidCustomUrl('https://gateway.example.com/v1', 'openai')).toBe(true);
    expect(isValidCustomUrl('https://gateway.example.com/v1', 'anthropic')).toBe(true);
  });
  it('accepts http only for localhost', () => {
    expect(isValidCustomUrl('http://localhost:11434/v1', 'openai')).toBe(true);
    expect(isValidCustomUrl('http://127.0.0.1:1234/v1', 'openai')).toBe(true);
    expect(isValidCustomUrl('http://remote.example.com/v1', 'openai')).toBe(false);
  });
  it('accepts a gemini root without /v1', () => {
    expect(isValidCustomUrl('https://my-proxy.example.com', 'gemini')).toBe(true);
  });
  it('rejects non-http(s) protocols', () => {
    expect(isValidCustomUrl('ftp://x/v1', 'openai')).toBe(false);
    expect(isValidCustomUrl('not-a-url', 'openai')).toBe(false);
  });
});

describe('fetchProviderIndex', () => {
  it('falls back to the bundled list when the fetch fails', async () => {
    mocks.fetchMock.mockRejectedValue(new Error('offline'));
    const out = await fetchProviderIndex();
    expect(out.length).toBe(BUNDLED_PROVIDERS.length);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('fetches, maps, and caches the remote index', async () => {
    mocks.fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        openai: { id: 'openai', name: 'OpenAI', npm: '@ai-sdk/openai', models: {} },
      }),
    });
    const out = await fetchProviderIndex();
    expect(out[0]).toMatchObject({ id: 'openai', apiCompatibility: 'openai' });
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ [PROVIDERS_INDEX_CACHE_KEY]: expect.any(Object) }));
  });

  it('serves a fresh cached index without refetching', async () => {
    mocks.get.mockImplementation(async (k: string) =>
      k === PROVIDERS_INDEX_CACHE_KEY
        ? { [k]: { ts: Date.now(), providers: [{ id: 'cached', name: 'Cached', baseUrl: 'x', apiCompatibility: 'openai' as const }] } }
        : { [k]: undefined },
    );
    const out = await fetchProviderIndex();
    expect(out[0]?.id).toBe('cached');
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });

  it('clearProviderIndexCache removes the cached index', async () => {
    await clearProviderIndexCache();
    expect(mocks.remove).toHaveBeenCalledWith(PROVIDERS_INDEX_CACHE_KEY);
  });
});

describe('getProviderModels ladder', () => {
  it('uses remote-index models when no key is present', async () => {
    const provider: ProviderDef = { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiCompatibility: 'openai', models: ['gpt-4o-mini', 'gpt-4o'] };
    await expect(getProviderModels(provider)).resolves.toEqual(['gpt-4o-mini', 'gpt-4o']);
  });

  it('live-fetches the provider models endpoint with a key', async () => {
    mocks.fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [{ id: 'm1' }, { id: 'm2' }] }) });
    const provider: ProviderDef = { id: 'custom', name: 'custom', baseUrl: 'https://gw.test/v1', apiCompatibility: 'openai' };
    await expect(getProviderModels(provider, 'KEY')).resolves.toEqual(['m1', 'm2']);
  });

  it('falls back to bundled suggestions when no key and no index models', async () => {
    const provider: ProviderDef = { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', apiCompatibility: 'openai', bundledModels: ['llama-3.3-70b-versatile'] };
    await expect(getProviderModels(provider)).resolves.toEqual(['llama-3.3-70b-versatile']);
  });

  it('returns undefined when nothing is available', async () => {
    const provider: ProviderDef = { id: 'custom', name: 'custom', baseUrl: 'https://gw.test/v1', apiCompatibility: 'gemini' };
    await expect(getProviderModels(provider)).resolves.toBeUndefined();
  });
});
