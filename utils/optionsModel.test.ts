// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildConfig, normalizeThreshold, providerOptions } from './optionsModel';
import type { LlmConfig } from './settings';

const PROVIDERS = [
  { id: 'google', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com', apiCompatibility: 'gemini' as const },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiCompatibility: 'openai' as const },
];

describe('providerOptions', () => {
  it('pins Custom Provider first, then alphabetical', () => {
    const opts = providerOptions(PROVIDERS);
    expect(opts.map((o) => o.value)).toEqual(['custom', 'google', 'openai']);
  });
});

describe('buildConfig', () => {
  it('resolves a well-known provider config from the registry', () => {
    const cfg = buildConfig({ providerId: 'openai', model: 'gpt-4o-mini', modelFromList: true, apiKey: ' sk-1 ', providers: PROVIDERS });
    expect(cfg).toEqual({
      providerId: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiCompatibility: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'sk-1',
    } satisfies LlmConfig);
  });

  it('requires an API key', () => {
    const cfg = buildConfig({ providerId: 'openai', model: 'gpt-4o-mini', modelFromList: true, apiKey: '', providers: PROVIDERS });
    expect('error' in cfg).toBe(true);
  });

  it('rejects an unknown provider', () => {
    const cfg = buildConfig({ providerId: 'nope', model: 'x', modelFromList: false, apiKey: 'k', providers: PROVIDERS });
    expect('error' in cfg).toBe(true);
  });

  it('validates free-text model ids but skips validation for list picks', () => {
    const bad = buildConfig({ providerId: 'openai', model: 'GPT-4o', modelFromList: false, apiKey: 'k', providers: PROVIDERS });
    expect('error' in bad).toBe(true);
    const listPick = buildConfig({ providerId: 'openai', model: 'gpt-4o-mini', modelFromList: true, apiKey: 'k', providers: PROVIDERS });
    expect('error' in listPick).toBe(false);
  });

  it('builds a valid custom provider config and normalizes the URL', () => {
    const cfg = buildConfig({
      providerId: 'custom', customName: 'My GW', customUrl: 'https://gw.test/v1/', customCompat: 'openai',
      model: 'my-model', modelFromList: false, apiKey: 'k', providers: PROVIDERS,
    });
    expect(cfg).toMatchObject({
      providerId: 'custom',
      customName: 'My GW',
      baseUrl: 'https://gw.test/v1',
      apiCompatibility: 'openai',
      model: 'my-model',
    });
  });

  it('rejects an invalid custom URL (http remote)', () => {
    const cfg = buildConfig({
      providerId: 'custom', customName: 'X', customUrl: 'http://remote.test/v1', customCompat: 'openai',
      model: 'm', modelFromList: false, apiKey: 'k', providers: PROVIDERS,
    });
    expect('error' in cfg).toBe(true);
  });

  it('accepts a gemini-compat custom URL without /v1', () => {
    const cfg = buildConfig({
      providerId: 'custom', customName: 'X', customUrl: 'https://my-proxy.test', customCompat: 'gemini',
      model: 'm', modelFromList: false, apiKey: 'k', providers: PROVIDERS,
    });
    expect(cfg).toMatchObject({ apiCompatibility: 'gemini', baseUrl: 'https://my-proxy.test' });
  });

  it('requires a custom name and URL', () => {
    const noName = buildConfig({ providerId: 'custom', customName: '', customUrl: 'https://x.test/v1', customCompat: 'openai', model: 'm', modelFromList: false, apiKey: 'k', providers: PROVIDERS });
    expect('error' in noName).toBe(true);
    const noUrl = buildConfig({ providerId: 'custom', customName: 'X', customUrl: '', customCompat: 'openai', model: 'm', modelFromList: false, apiKey: 'k', providers: PROVIDERS });
    expect('error' in noUrl).toBe(true);
  });
});

describe('normalizeThreshold', () => {
  it('clamps and rounds to 0–MAX (so a too-strict value cannot break rewriting)', () => {
    expect(normalizeThreshold(150)).toBe(90);
    expect(normalizeThreshold(100)).toBe(90);
    expect(normalizeThreshold(-5)).toBe(0);
    expect(normalizeThreshold(80.6)).toBe(81);
  });
  it('defaults on non-finite input', () => {
    expect(normalizeThreshold(NaN)).toBe(50);
    expect(normalizeThreshold(Infinity)).toBe(50);
  });
});
