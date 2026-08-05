// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildDefaults } from './buildDefaults';

const ALL_VARS = [
  'VITE_ENABLE_BUILD_DEFAULTS',
  'VITE_DEFAULT_PROVIDER_ID',
  'VITE_DEFAULT_BASE_URL',
  'VITE_DEFAULT_COMPAT',
  'VITE_DEFAULT_MODEL',
  'VITE_DEFAULT_API_KEY',
  'VITE_DEFAULT_CONFIDENCE_THRESHOLD',
];

// Vite loads .env.local into import.meta.env during tests; neutralize every
// default var so each test starts clean.
beforeEach(() => {
  for (const k of ALL_VARS) vi.stubEnv(k, '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildDefaults', () => {
  it('returns undefined when the feature is not enabled (production build)', () => {
    expect(buildDefaults()).toBeUndefined();
  });

  it('returns undefined when required vars are missing', () => {
    vi.stubEnv('VITE_ENABLE_BUILD_DEFAULTS', '1');
    expect(buildDefaults()).toBeUndefined();
  });

  it('requires a base URL for openai/anthropic compat', () => {
    vi.stubEnv('VITE_ENABLE_BUILD_DEFAULTS', '1');
    vi.stubEnv('VITE_DEFAULT_PROVIDER_ID', 'x');
    vi.stubEnv('VITE_DEFAULT_MODEL', 'm');
    vi.stubEnv('VITE_DEFAULT_API_KEY', 'k');
    expect(buildDefaults()).toBeUndefined();
  });

  it('builds a config from provided env vars', () => {
    vi.stubEnv('VITE_ENABLE_BUILD_DEFAULTS', '1');
    vi.stubEnv('VITE_DEFAULT_PROVIDER_ID', 'opencode-go');
    vi.stubEnv('VITE_DEFAULT_BASE_URL', 'https://opencode.ai/zen/go/v1');
    vi.stubEnv('VITE_DEFAULT_COMPAT', 'openai');
    vi.stubEnv('VITE_DEFAULT_MODEL', 'deepseek-v4-flash');
    vi.stubEnv('VITE_DEFAULT_API_KEY', 'KEY');
    vi.stubEnv('VITE_DEFAULT_CONFIDENCE_THRESHOLD', '70');
    expect(buildDefaults()).toEqual({
      config: {
        providerId: 'opencode-go',
        baseUrl: 'https://opencode.ai/zen/go/v1',
        apiCompatibility: 'openai',
        model: 'deepseek-v4-flash',
        apiKey: 'KEY',
      },
      confidenceThreshold: 70,
    });
  });

  it('clamps the threshold to 0-90 and defaults missing compat to openai', () => {
    vi.stubEnv('VITE_ENABLE_BUILD_DEFAULTS', '1');
    vi.stubEnv('VITE_DEFAULT_PROVIDER_ID', 'x');
    vi.stubEnv('VITE_DEFAULT_BASE_URL', 'https://x/v1');
    vi.stubEnv('VITE_DEFAULT_MODEL', 'm');
    vi.stubEnv('VITE_DEFAULT_API_KEY', 'k');
    vi.stubEnv('VITE_DEFAULT_CONFIDENCE_THRESHOLD', '150');
    const d = buildDefaults();
    expect(d?.config.apiCompatibility).toBe('openai');
    expect(d?.confidenceThreshold).toBe(90);
  });

  it('allows gemini without a base URL', () => {
    vi.stubEnv('VITE_ENABLE_BUILD_DEFAULTS', '1');
    vi.stubEnv('VITE_DEFAULT_PROVIDER_ID', 'google');
    vi.stubEnv('VITE_DEFAULT_COMPAT', 'gemini');
    vi.stubEnv('VITE_DEFAULT_MODEL', 'gemini-2.5-flash');
    vi.stubEnv('VITE_DEFAULT_API_KEY', 'k');
    expect(buildDefaults()).toMatchObject({ config: { providerId: 'google', apiCompatibility: 'gemini' } });
  });
});
