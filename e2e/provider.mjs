// Shared E2E provider resolution.
//
// Reads .env.local and returns the first configured provider's full LLM config
// (including apiKey). OPENCODE_API_KEY (OpenCode Go, openai-compatible,
// deepseek-v4-flash) is preferred; GEMINI_API_KEY (Gemini,
// gemini-3.1-flash-lite) is the fallback. Returns undefined when neither is set.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PROVIDER_CONFIGS = [
  {
    envKey: 'OPENCODE_API_KEY',
    config: {
      providerId: 'opencode-go',
      baseUrl: 'https://opencode.ai/zen/go/v1',
      apiCompatibility: 'openai',
      model: 'deepseek-v4-flash',
    },
  },
  {
    envKey: 'GEMINI_API_KEY',
    config: {
      providerId: 'google',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiCompatibility: 'gemini',
      model: 'gemini-3.1-flash-lite',
    },
  },
];

/** First configured provider's key + config from .env.local; undefined when none. */
export function readProviderConfig() {
  const raw = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  for (const { envKey, config } of PROVIDER_CONFIGS) {
    const m = raw.match(new RegExp(`^${envKey}=(.+)$`, 'm'));
    if (m && m[1].trim()) return { apiKey: m[1].trim(), ...config };
  }
  return undefined;
}
