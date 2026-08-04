// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { transform, getLlmConfig, getConfidenceThreshold, testConnection } from './llmClient';
import { CONFIDENCE_THRESHOLD_KEY, LLM_CONFIG_KEY, type LlmConfig } from './settings';

/** Hoisted mocks shared with the vi.mock factories below. */
const mocks = vi.hoisted(() => {
  class FetchError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  }
  return {
    storageGet: vi.fn(),
    storageSet: vi.fn(),
    generateContent: vi.fn(),
    getGenerativeModel: vi.fn(),
    fetchMock: vi.fn(),
    FetchError,
  };
});

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: mocks.storageGet,
        set: mocks.storageSet,
      },
    },
  },
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({ getGenerativeModel: mocks.getGenerativeModel })),
  GoogleGenerativeAIFetchError: mocks.FetchError,
}));

const CFG = (over: Partial<LlmConfig> = {}): LlmConfig => ({
  providerId: 'google',
  baseUrl: 'https://generativelanguage.googleapis.com',
  apiCompatibility: 'gemini',
  model: 'gemini-2.5-flash',
  apiKey: 'ABC123',
  ...over,
});

/** Seed storage with a Gemini config (gemini default path). */
function seedConfig(cfg?: Partial<LlmConfig>, extra: Record<string, unknown> = {}): void {
  mocks.storageGet.mockResolvedValue({ [LLM_CONFIG_KEY]: CFG(cfg), ...extra });
}

/** Make generateContent resolve with a JSON `{ results: [...] }` payload. */
function resolveResults(results: string[]): void {
  mocks.generateContent.mockResolvedValue({
    response: { text: () => JSON.stringify({ results }) },
  });
}

function mockModel() {
  mocks.getGenerativeModel.mockReturnValue({ generateContent: mocks.generateContent });
}

/** Minimal ok fetch response. */
function okFetch(json: unknown) {
  mocks.fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => json });
}

beforeEach(() => {
  mocks.storageGet.mockReset();
  mocks.storageSet.mockReset();
  mocks.generateContent.mockReset();
  mocks.getGenerativeModel.mockReset();
  mocks.fetchMock.mockReset();
  mocks.storageGet.mockResolvedValue({});
  mocks.storageSet.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', mocks.fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('llmClient.transform (Gemini path)', () => {
  it('returns not-configured for every item and makes no API call when no config is set', async () => {
    mocks.storageGet.mockResolvedValue({});
    const results = await transform(['a b c', 'd e f']);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.ok).toBe(false);
      expect(r.error).toBe('not-configured');
    }
    expect(mocks.getGenerativeModel).not.toHaveBeenCalled();
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });

  it('returns not-configured when the stored key is blank/whitespace', async () => {
    seedConfig({ apiKey: '   ' });
    const results = await transform(['a b c']);
    expect(results[0]!.error).toBe('not-configured');
  });

  it('transforms all texts when a config is present', async () => {
    seedConfig();
    mockModel();
    resolveResults(['I completely agree with you', 'He does not know the answer']);
    const results = await transform(['I am very agree with you', "He don't know the answer"]);
    expect(results.map((r) => [r.ok, r.text])).toEqual([
      [true, 'I completely agree with you'],
      [true, 'He does not know the answer'],
    ]);
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
  });

  it('splits a large list into bounded batches (BATCH_SIZE)', async () => {
    seedConfig();
    mockModel();
    const many = Array.from({ length: 16 }, (_, i) => `text number ${i} here`);
    resolveResults(many);
    const results = await transform(many);
    expect(results).toHaveLength(16);
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
  });

  it('degrades to ok:false with rate-limit on a 429 fetch error', async () => {
    seedConfig();
    mockModel();
    mocks.generateContent.mockRejectedValue(new mocks.FetchError('quota', 429));
    const results = await transform(['a b c', 'd e f']);
    expect(results.every((r) => r.ok === false && r.error === 'rate-limit')).toBe(true);
  });

  it('degrades to ok:false with timeout on an AbortError', async () => {
    seedConfig();
    mockModel();
    mocks.generateContent.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const results = await transform(['a b c']);
    expect(results[0]).toEqual({ ok: false, text: '', error: 'timeout' });
  });

  it('degrades to ok:false with internal on an unparsable reply', async () => {
    seedConfig();
    mockModel();
    mocks.generateContent.mockResolvedValue({ response: { text: () => 'not json at all' } });
    const results = await transform(['a b c']);
    expect(results[0]).toEqual({ ok: false, text: '', error: 'internal' });
  });

  it('does not throw even when the whole call path fails', async () => {
    mocks.storageGet.mockRejectedValue(new Error('storage down'));
    await expect(transform(['a b c'])).resolves.toEqual([
      { ok: false, text: '', error: 'not-configured' },
    ]);
  });

  it('rejects a low-similarity rewrite at the default threshold', async () => {
    seedConfig();
    mockModel();
    resolveResults(['completely unrelated output']);
    const results = await transform(['a normal sentence here']);
    expect(results[0]).toEqual({ ok: false, text: '', error: 'low-confidence' });
  });

  it('applies a stored (higher) threshold to subsequent transforms', async () => {
    seedConfig({}, { [CONFIDENCE_THRESHOLD_KEY]: 80 });
    mockModel();
    resolveResults(['polished one']);
    const results = await transform(['text one']);
    expect(results[0]).toEqual({ ok: false, text: '', error: 'low-confidence' });
  });
});

describe('llmClient.transform (OpenAI-compatible path)', () => {
  it('posts to chat/completions with a Bearer token and parses the reply', async () => {
    seedConfig({ providerId: 'openai', baseUrl: 'https://api.openai.com/v1', apiCompatibility: 'openai', model: 'gpt-4o-mini' });
    okFetch({ choices: [{ message: { content: '{"results":["polished one"]}' } }] });

    const results = await transform(['text one']);
    expect(results[0]).toEqual({ ok: true, text: 'polished one' });
    const [url, init] = mocks.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer ABC123');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gpt-4o-mini');
  });

  it('maps an HTTP 429 to rate-limit', async () => {
    seedConfig({ providerId: 'openai', baseUrl: 'https://api.openai.com/v1', apiCompatibility: 'openai', model: 'gpt-4o-mini' });
    mocks.fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    const results = await transform(['text one']);
    expect(results[0]).toEqual({ ok: false, text: '', error: 'rate-limit' });
  });
});

describe('llmClient.transform (Anthropic-compatible path)', () => {
  it('posts to /messages with x-api-key and parses the text reply', async () => {
    seedConfig({ providerId: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiCompatibility: 'anthropic', model: 'claude-sonnet-4-5' });
    okFetch({ content: [{ type: 'text', text: '{"results":["polished one"]}' }] });

    const results = await transform(['text one']);
    expect(results[0]).toEqual({ ok: true, text: 'polished one' });
    const [url, init] = mocks.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('ABC123');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('extracts the JSON array from prose-wrapped Anthropic replies', async () => {
    seedConfig({ providerId: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiCompatibility: 'anthropic', model: 'claude-sonnet-4-5' });
    okFetch({ content: [{ type: 'text', text: 'Here are the rewrites:\n["polished one", "two text"]\nHope that helps.' }] });

    const results = await transform(['text one', 'text two']);
    expect(results.map((r) => [r.ok, r.text])).toEqual([
      [true, 'polished one'],
      [true, 'two text'],
    ]);
  });
});

describe('llmClient cache integration', () => {
  it('serves a cache hit without calling the API', async () => {
    const now = Date.now();
    seedConfig({}, { [LLM_CONFIG_KEY]: CFG(), 'cache:polish:v1': { 'text one': { polished: 'CACHED ONE', ts: now } } });
    mockModel();
    const results = await transform(['text one']);
    expect(results).toEqual([{ ok: true, text: 'CACHED ONE' }]);
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('writes back ok results to the cache', async () => {
    seedConfig({}, { 'cache:polish:v1': {} });
    mockModel();
    resolveResults(['polished one']);
    await transform(['text one']);
    const write = mocks.storageSet.mock.calls.map((c) => c[0] as Record<string, unknown>);
    const cached = write.filter((o) => 'cache:polish:v1' in o).at(-1)?.['cache:polish:v1'] as Record<string, { polished: string }>;
    expect(cached?.['text one']?.polished).toBe('polished one');
  });
});

describe('testConnection', () => {
  it('succeeds for a working Gemini config', async () => {
    mockModel();
    mocks.generateContent.mockResolvedValue({ response: { text: () => 'ok' } });
    await expect(testConnection(CFG())).resolves.toEqual({ ok: true });
  });

  it('succeeds for a working OpenAI-compatible config', async () => {
    okFetch({ choices: [{ message: { content: 'ok' } }] });
    const cfg = CFG({ providerId: 'openai', baseUrl: 'https://api.openai.com/v1', apiCompatibility: 'openai', model: 'gpt-4o-mini' });
    await expect(testConnection(cfg)).resolves.toEqual({ ok: true });
  });

  it('reports a normalized reason on failure', async () => {
    mocks.fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    const cfg = CFG({ providerId: 'openai', baseUrl: 'https://api.openai.com/v1', apiCompatibility: 'openai', model: 'gpt-4o-mini' });
    await expect(testConnection(cfg)).resolves.toEqual({ ok: false, reason: 'http-401' });
  });
});

describe('getConfidenceThreshold', () => {
  it('returns the conservative default when nothing is stored', async () => {
    mocks.storageGet.mockResolvedValue({});
    await expect(getConfidenceThreshold()).resolves.toBe(50);
  });

  it('clamps out-of-range values to 0–100', async () => {
    mocks.storageGet.mockResolvedValue({ [CONFIDENCE_THRESHOLD_KEY]: 150 });
    await expect(getConfidenceThreshold()).resolves.toBe(100);
  });

  it('falls back to the default for invalid values', async () => {
    mocks.storageGet.mockResolvedValue({ [CONFIDENCE_THRESHOLD_KEY]: 'nope' });
    await expect(getConfidenceThreshold()).resolves.toBe(50);
  });
});

describe('getLlmConfig', () => {
  it('reads a stored config using the bare-key form', async () => {
    mocks.storageGet.mockResolvedValue({ [LLM_CONFIG_KEY]: CFG() });
    await expect(getLlmConfig()).resolves.toEqual(CFG());
    expect(mocks.storageGet).toHaveBeenCalledWith(LLM_CONFIG_KEY);
  });

  it('returns undefined when nothing is stored', async () => {
    mocks.storageGet.mockResolvedValue({});
    await expect(getLlmConfig()).resolves.toBeUndefined();
  });

  it('returns undefined for a config with a blank key', async () => {
    mocks.storageGet.mockResolvedValue({ [LLM_CONFIG_KEY]: CFG({ apiKey: '   ' }) });
    await expect(getLlmConfig()).resolves.toBeUndefined();
  });
});
