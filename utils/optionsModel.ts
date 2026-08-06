/**
 * Options-page config building (testable, DOM-free).
 *
 * Turns the form's raw values into a validated `LlmConfig`, resolving a
 * well-known provider's base URL/compatibility from the registry and validating
 * custom URLs + free-text model ids at the trust boundary.
 */
import type { ApiCompatibility, LlmConfig } from './settings';
import { DEFAULT_CONFIDENCE_THRESHOLD, MAX_CONFIDENCE_THRESHOLD } from './settings';
import {
  getProviderById,
  isValidCustomUrl,
  isValidModelId,
  normalizeBaseUrl,
  sortProviders,
  type ProviderDef,
} from './providers';

export interface ConfigInput {
  providerId: string;
  customName?: string;
  customUrl?: string;
  customCompat?: ApiCompatibility;
  model: string;
  /** True when the model came from the provider's list (skips id validation). */
  modelFromList: boolean;
  apiKey: string;
  providers: ProviderDef[];
}

/** A build failure keyed by the form field that must be fixed. */
export type ConfigErrors = Partial<Record<'provider' | 'customName' | 'customUrl' | 'model' | 'apiKey', string>>;

export type ConfigResult = LlmConfig | { errors: ConfigErrors };

/** Build a validated config from form values; `{ errors }` on invalid input. */
export function buildConfig(input: ConfigInput): ConfigResult {
  const apiKey = input.apiKey.trim();
  if (!apiKey) return { errors: { apiKey: 'Enter an API key before saving.' } };
  const model = input.model.trim();
  if (!model) return { errors: { model: 'Select or enter a model.' } };
  if (!input.modelFromList && !isValidModelId(model)) {
    return { errors: { model: 'Model id may only contain lowercase letters, digits, hyphens, dots, colons, and slashes.' } };
  }

  if (input.providerId === 'custom') {
    const customName = (input.customName ?? '').trim();
    const customUrl = (input.customUrl ?? '').trim();
    const compat = input.customCompat ?? 'openai';
    if (!customName) return { errors: { customName: 'Enter a name for the custom provider.' } };
    if (!customUrl) return { errors: { customUrl: 'Enter a base URL for the custom provider.' } };
    if (!isValidCustomUrl(customUrl, compat)) {
      return {
        errors: {
          customUrl:
            'That base URL is invalid for the selected compatibility: https ending in /v1 for openai/anthropic (http allowed for localhost), or a generativelanguage root for gemini.',
        },
      };
    }
    return {
      providerId: 'custom',
      customName,
      baseUrl: normalizeBaseUrl(customUrl, compat),
      apiCompatibility: compat,
      model,
      apiKey,
    };
  }

  const provider = getProviderById(input.providers, input.providerId);
  if (!provider) return { errors: { provider: 'Unknown provider.' } };
  return {
    providerId: provider.id,
    baseUrl: provider.baseUrl,
    apiCompatibility: provider.apiCompatibility,
    model,
    apiKey,
  };
}

/** Provider dropdown options: "Custom Provider" pinned first, then alphabetical. */
export function providerOptions(providers: ProviderDef[]): { value: string; label: string }[] {
  return [
    { value: 'custom', label: 'Custom Provider' },
    ...sortProviders(providers).map((p) => ({ value: p.id, label: p.name })),
  ];
}

/** Clamp and round a raw threshold value to a 0–MAX integer. */
export function normalizeThreshold(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_CONFIDENCE_THRESHOLD;
  return Math.min(MAX_CONFIDENCE_THRESHOLD, Math.max(0, Math.round(raw)));
}
