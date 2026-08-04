// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { transform, getApiKey, getConfidenceThreshold } from './llmClient';
import { CONFIDENCE_THRESHOLD_KEY } from './settings';

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
    generateContent: vi.fn(),
    getGenerativeModel: vi.fn(),
    FetchError,
  };
});

vi.mock('wxt/browser', () => ({
  browser: { storage: { local: { get: mocks.storageGet } } },
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({ getGenerativeModel: mocks.getGenerativeModel })),
  GoogleGenerativeAIFetchError: mocks.FetchError,
}));

const KEY = 'gemini:apiKey';

/** Make generateContent resolve with a JSON `{ results: [...] }` payload. */
function resolveResults(results: string[]): void {
  mocks.generateContent.mockResolvedValue({
    response: { text: () => JSON.stringify({ results }) },
  });
}

function mockModel() {
  mocks.getGenerativeModel.mockReturnValue({ generateContent: mocks.generateContent });
}

beforeEach(() => {
  mocks.storageGet.mockReset();
  mocks.generateContent.mockReset();
  mocks.getGenerativeModel.mockReset();
  mocks.storageGet.mockResolvedValue({});
});

describe('llmClient.transform (batch)', () => {
  it('returns not-configured for every item and makes no API call when no key is set', async () => {
    mocks.storageGet.mockResolvedValue({});
    const results = await transform(['a b c', 'd e f']);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.ok).toBe(false);
      expect(r.error).toBe('not-configured');
    }
    expect(mocks.getGenerativeModel).not.toHaveBeenCalled();
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('returns not-configured when the stored key is blank/whitespace', async () => {
    mocks.storageGet.mockResolvedValue({ [KEY]: '   ' });
    const results = await transform(['a b c']);
    expect(results[0]!.error).toBe('not-configured');
  });

  it('transforms all texts when a key is configured', async () => {
    mocks.storageGet.mockResolvedValue({ [KEY]: 'ABC123' });
    mockModel();
    resolveResults(['I completely agree with you', 'He does not know the answer']);
    const results = await transform(['I am very agree with you', "He don't know the answer"]);
    expect(results.map((r) => [r.ok, r.text])).toEqual([
      [true, 'I completely agree with you'],
      [true, 'He does not know the answer'],
    ]);
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
  });

  it('keeps the original verbatim when the model returns it unchanged', async () => {
    mocks.storageGet.mockResolvedValue({ [KEY]: 'ABC123' });
    mockModel();
    resolveResults(['already natural text']);
    const results = await transform(['already natural text']);
    expect(results[0]).toEqual({ ok: true, text: 'already natural text' });
  });

  it('splits a large list into bounded batches (BATCH_SIZE)', async () => {
    mocks.storageGet.mockResolvedValue({ [KEY]: 'ABC123' });
    mockModel();
    const many = Array.from({ length: 16 }, (_, i) => `text number ${i} here`);
    resolveResults(many);
    const results = await transform(many);
    expect(results).toHaveLength(16);
    // 16 items / batch of 15 => 2 model calls.
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
  });

  it('degrades to ok:false with rate-limit on a 429 fetch error', async () => {
    mocks.storageGet.mockResolvedValue({ [KEY]: 'ABC123' });
    mockModel();
    mocks.generateContent.mockRejectedValue(new mocks.FetchError('quota', 429));
    const results = await transform(['a b c', 'd e f']);
    expect(results.every((r) => r.ok === false && r.error === 'rate-limit')).toBe(true);
  });

  it('degrades to ok:false with timeout on an AbortError', async () => {
    mocks.storageGet.mockResolvedValue({ [KEY]: 'ABC123' });
    mockModel();
    mocks.generateContent.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const results = await transform(['a b c']);
    expect(results[0]).toEqual({ ok: false, text: '', error: 'timeout' });
  });

  it('degrades to ok:false with network on a generic error', async () => {
    mocks.storageGet.mockResolvedValue({ [KEY]: 'ABC123' });
    mockModel();
    mocks.generateContent.mockRejectedValue(new Error('socket hang up'));
    const results = await transform(['a b c']);
    expect(results[0]).toEqual({ ok: false, text: '', error: 'network' });
  });

  it('degrades to ok:false with internal on an unparsable reply', async () => {
    mocks.storageGet.mockResolvedValue({ [KEY]: 'ABC123' });
    mockModel();
    mocks.generateContent.mockResolvedValue({
      response: { text: () => 'not json at all' },
    });
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
    mocks.storageGet.mockResolvedValue({ [KEY]: 'ABC123' }); // no threshold → default 50
    mockModel();
    resolveResults(['completely unrelated output']);
    const results = await transform(['a normal sentence here']);
    expect(results[0]).toEqual({ ok: false, text: '', error: 'low-confidence' });
  });

  it('applies a stored (higher) threshold to subsequent transforms', async () => {
    mocks.storageGet.mockResolvedValue({ [KEY]: 'ABC123', [CONFIDENCE_THRESHOLD_KEY]: 80 });
    mockModel();
    // 'polished one' vs 'text one' scores 50/100 — passes at 50, rejected at 80.
    resolveResults(['polished one']);
    const results = await transform(['text one']);
    expect(results[0]).toEqual({ ok: false, text: '', error: 'low-confidence' });
  });

  it('threshold 0 admits any non-empty rewrite', async () => {
    mocks.storageGet.mockResolvedValue({ [KEY]: 'ABC123', [CONFIDENCE_THRESHOLD_KEY]: 0 });
    mockModel();
    resolveResults(['completely unrelated output']);
    const results = await transform(['a normal sentence here']);
    expect(results[0]).toEqual({ ok: true, text: 'completely unrelated output' });
  });
});

describe('getConfidenceThreshold', () => {
  it('returns the conservative default when nothing is stored', async () => {
    mocks.storageGet.mockResolvedValue({});
    await expect(getConfidenceThreshold()).resolves.toBe(50);
  });

  it('reads a stored numeric threshold', async () => {
    mocks.storageGet.mockResolvedValue({ [CONFIDENCE_THRESHOLD_KEY]: 80 });
    await expect(getConfidenceThreshold()).resolves.toBe(80);
  });

  it('clamps out-of-range values to 0–100', async () => {
    mocks.storageGet.mockResolvedValue({ [CONFIDENCE_THRESHOLD_KEY]: 150 });
    await expect(getConfidenceThreshold()).resolves.toBe(100);
    mocks.storageGet.mockResolvedValue({ [CONFIDENCE_THRESHOLD_KEY]: -5 });
    await expect(getConfidenceThreshold()).resolves.toBe(0);
  });

  it('falls back to the default for invalid or unreadable values', async () => {
    mocks.storageGet.mockResolvedValue({ [CONFIDENCE_THRESHOLD_KEY]: 'not-a-number' });
    await expect(getConfidenceThreshold()).resolves.toBe(50);
    mocks.storageGet.mockRejectedValue(new Error('storage down'));
    await expect(getConfidenceThreshold()).resolves.toBe(50);
  });
});

describe('getApiKey', () => {
  it('reads a stored key from storage.local using the bare-key form', async () => {
    mocks.storageGet.mockResolvedValue({ [KEY]: 'MY-KEY' });
    await expect(getApiKey()).resolves.toBe('MY-KEY');
    // Regression: must not use the object form with an `undefined` default, which
    // Chrome drops (making the extension permanently "not configured").
    expect(mocks.storageGet).toHaveBeenCalledWith(KEY);
  });

  it('returns undefined when no key is stored', async () => {
    mocks.storageGet.mockResolvedValue({});
    await expect(getApiKey()).resolves.toBeUndefined();
  });
});
