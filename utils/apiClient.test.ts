// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiHttpError, anthropicChat, openAiChat } from './apiClient';

const mocks = vi.hoisted(() => ({ fetchMock: vi.fn() }));

beforeEach(() => {
  mocks.fetchMock.mockReset();
  vi.stubGlobal('fetch', mocks.fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openAiChat', () => {
  it('posts the right URL, headers, and body', async () => {
    mocks.fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'polished' } }] }) });
    const text = await openAiChat('https://api.openai.com/v1', 'gpt-4o-mini', 'do it', 'KEY-1', undefined, 'be natural');
    expect(text).toBe('polished');
    const [url, init] = mocks.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer KEY-1');
    const body = JSON.parse(init.body as string);
    expect(body.messages).toEqual([
      { role: 'system', content: 'be natural' },
      { role: 'user', content: 'do it' },
    ]);
  });

  it('throws ApiHttpError on a non-ok response', async () => {
    mocks.fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    await expect(openAiChat('https://x/v1', 'm', 'p', 'k')).rejects.toBeInstanceOf(ApiHttpError);
    await expect(openAiChat('https://x/v1', 'm', 'p', 'k')).rejects.toMatchObject({ status: 503 });
  });

  it('throws on an empty completion', async () => {
    mocks.fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '' } }] }) });
    await expect(openAiChat('https://x/v1', 'm', 'p', 'k')).rejects.toThrow('empty');
  });
});

describe('anthropicChat', () => {
  it('posts to /messages with anthropic headers and parses text blocks', async () => {
    mocks.fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }),
    });
    const text = await anthropicChat('https://api.anthropic.com/v1', 'claude-x', 'do it', 'KEY-1', undefined, 'be natural');
    expect(text).toBe('ab');
    const [url, init] = mocks.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('KEY-1');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe('be natural');
    expect(body.max_tokens).toBeGreaterThan(0);
  });

  it('throws ApiHttpError on a non-ok response', async () => {
    mocks.fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(anthropicChat('https://x/v1', 'm', 'p', 'k')).rejects.toMatchObject({ status: 401 });
  });

  it('throws on an empty response body', async () => {
    mocks.fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ content: [] }) });
    await expect(anthropicChat('https://x/v1', 'm', 'p', 'k')).rejects.toThrow('empty');
  });
});
