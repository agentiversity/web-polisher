/**
 * Build-time default configuration, injected from Vite env vars (VITE_*).
 *
 * Only active when `VITE_ENABLE_BUILD_DEFAULTS` is set — i.e. only for local /
 * testing builds, never a production build. When the required vars are missing
 * this returns `undefined` and the normal (empty) defaults apply. The options
 * page and action popup seed a saved configuration from these on first open, so
 * a testing build comes pre-configured and works immediately.
 */
import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  MAX_CONFIDENCE_THRESHOLD,
  type ApiCompatibility,
  type LlmConfig,
} from './settings';

export interface BuildDefaults {
  config: LlmConfig;
  confidenceThreshold: number;
}

export function buildDefaults(): BuildDefaults | undefined {
  const env = import.meta.env as Record<string, string | undefined>;
  if (!env.VITE_ENABLE_BUILD_DEFAULTS) return undefined;

  const providerId = env.VITE_DEFAULT_PROVIDER_ID?.trim();
  const baseUrl = env.VITE_DEFAULT_BASE_URL?.trim();
  const compat = env.VITE_DEFAULT_COMPAT?.trim();
  const model = env.VITE_DEFAULT_MODEL?.trim();
  const apiKey = env.VITE_DEFAULT_API_KEY?.trim();
  if (!providerId || !model || !apiKey) return undefined;

  const apiCompatibility: ApiCompatibility =
    compat === 'anthropic' || compat === 'gemini' ? compat : 'openai';
  // OpenAI/Anthropic-compatible calls need a base URL; Gemini uses the SDK.
  if (apiCompatibility !== 'gemini' && !baseUrl) return undefined;

  const raw = Number(env.VITE_DEFAULT_CONFIDENCE_THRESHOLD);
  const confidenceThreshold = Number.isFinite(raw)
    ? Math.min(MAX_CONFIDENCE_THRESHOLD, Math.max(0, Math.round(raw)))
    : DEFAULT_CONFIDENCE_THRESHOLD;

  return {
    config: { providerId, baseUrl, apiCompatibility, model, apiKey },
    confidenceThreshold,
  };
}
