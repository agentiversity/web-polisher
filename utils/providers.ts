/**
 * Well-known provider registry (design D1/D2).
 *
 * Two sources, one shape:
 * - A bundled curated list (`BUNDLED_PROVIDERS`) used offline and as the last
 *   fallback for model discovery.
 * - A runtime-fetched index (models.dev, `MODELS_INDEX_URL`), cached in
 *   `storage.local` after the first successful fetch, mapped to the same shape
 *   by `adaptIndex`. Fetch failure silently falls back to the bundled list.
 *
 * Model discovery ladder for a provider: remote-index models → live-fetch the
 * provider's models endpoint (cached) → bundled suggestions → undefined (the
 * options page then offers free-text model id).
 *
 * Runs in the options page (an extension page), which has cross-origin fetch
 * rights via the manifest host permissions, so no background proxy is needed.
 */
import { browser } from 'wxt/browser';
import {
  MODELS_INDEX_URL,
  PROVIDER_MODELS_CACHE_KEY,
  PROVIDER_MODELS_TTL_MS,
  PROVIDERS_INDEX_CACHE_KEY,
  PROVIDERS_INDEX_TTL_MS,
  type ApiCompatibility,
} from './settings';

export interface ProviderDef {
  id: string;
  name: string;
  baseUrl: string;
  apiCompatibility: ApiCompatibility;
  /** Models from the remote index (the full list the provider offers). */
  models?: string[];
  /** Curated suggestion list used when no remote list is available. */
  bundledModels?: string[];
}

/** Well-known provider endpoints (official SDK providers in models.dev omit `api`). */
const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  xai: 'https://api.x.ai/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  deepinfra: 'https://api.deepinfra.com/v1/openai',
  perplexity: 'https://api.perplexity.ai',
  togetherai: 'https://api.together.xyz/v1',
};

/** Curated offline fallback list, alphabetically sorted. */
export const BUNDLED_PROVIDERS: ProviderDef[] = [
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', apiCompatibility: 'anthropic', bundledModels: ['claude-sonnet-4-5', 'claude-opus-4-5', 'claude-3-5-haiku-latest'] },
  { id: 'cerebras', name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', apiCompatibility: 'openai', bundledModels: ['llama-3.3-70b'] },
  { id: 'deepinfra', name: 'Deep Infra', baseUrl: 'https://api.deepinfra.com/v1/openai', apiCompatibility: 'openai', bundledModels: ['meta-llama/Meta-Llama-3.1-70B-Instruct'] },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', apiCompatibility: 'openai', bundledModels: ['deepseek-chat', 'deepseek-reasoner'] },
  { id: 'fireworks-ai', name: 'Fireworks AI', baseUrl: 'https://api.fireworks.ai/inference/v1', apiCompatibility: 'openai', bundledModels: ['accounts/fireworks/models/llama-v3p3-70b-instruct'] },
  { id: 'google', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com', apiCompatibility: 'gemini', bundledModels: ['gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'] },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', apiCompatibility: 'openai', bundledModels: ['llama-3.3-70b-versatile', 'deepseek-r1-distill-llama-70b'] },
  { id: 'lmstudio', name: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1', apiCompatibility: 'openai', bundledModels: [] },
  { id: 'mistral', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', apiCompatibility: 'openai', bundledModels: ['mistral-large-latest', 'mistral-small-latest'] },
  { id: 'nvidia', name: 'NVIDIA', baseUrl: 'https://integrate.api.nvidia.com/v1', apiCompatibility: 'openai', bundledModels: ['nvidia/llama-3.1-nemotron-70b-instruct'] },
  { id: 'ollama', name: 'Ollama', baseUrl: 'http://127.0.0.1:11434/v1', apiCompatibility: 'openai', bundledModels: ['llama3.1', 'qwen2.5'] },
  { id: 'opencode-go', name: 'OpenCode Go', baseUrl: 'https://opencode.ai/zen/go/v1', apiCompatibility: 'openai', bundledModels: [] },
  { id: 'opencode', name: 'OpenCode Zen', baseUrl: 'https://opencode.ai/zen/v1', apiCompatibility: 'openai', bundledModels: [] },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiCompatibility: 'openai', bundledModels: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'] },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', apiCompatibility: 'openai', bundledModels: ['openai/gpt-4o-mini', 'anthropic/claude-3-5-sonnet', 'meta-llama/llama-3.3-70b-instruct'] },
  { id: 'perplexity', name: 'Perplexity', baseUrl: 'https://api.perplexity.ai', apiCompatibility: 'openai', bundledModels: ['sonar-pro'] },
  { id: 'togetherai', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', apiCompatibility: 'openai', bundledModels: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'deepseek-ai/DeepSeek-V3'] },
  { id: 'xai', name: 'xAI', baseUrl: 'https://api.x.ai/v1', apiCompatibility: 'openai', bundledModels: ['grok-3', 'grok-2-latest'] },
];

/** Provider ids whose models.dev entry is a supported, official-SDK endpoint. */
const SDK_DEFAULT_IDS = Object.keys(DEFAULT_BASE_URLS);

/** AI SDK npm packages that speak each wire format. */
const OPENAI_NPM = new Set([
  '@ai-sdk/openai', '@ai-sdk/openai-compatible', '@ai-sdk/groq', '@ai-sdk/cerebras',
  '@ai-sdk/deepinfra', '@ai-sdk/mistral', '@ai-sdk/perplexity', '@ai-sdk/togetherai', '@ai-sdk/xai',
]);
const ANTHROPIC_NPM = new Set(['@ai-sdk/anthropic']);
const GEMINI_NPM = new Set(['@ai-sdk/google', '@ai-sdk/google-vertex']);

function compatFromNpm(npm: string): ApiCompatibility | undefined {
  if (OPENAI_NPM.has(npm)) return 'openai';
  if (ANTHROPIC_NPM.has(npm)) return 'anthropic';
  if (GEMINI_NPM.has(npm)) return 'gemini';
  return undefined;
}

/** Strip trailing slashes; ensure openai/anthropic base URLs carry a /v1 suffix. */
export function normalizeBaseUrl(url: string, compat: ApiCompatibility): string {
  const trimmed = url.replace(/\/+$/, '');
  if (compat === 'gemini') return trimmed;
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

interface ModelsDevModel {
  id: string;
  name: string;
  /** Modes of operation — which modalities the model can emit (e.g. text/image/audio). */
  modalities?: { input?: string[]; output?: string[] };
  /** Availability status; `deprecated` = decommissioned/superseded, `alpha` = not generally available. */
  status?: string;
}

interface ModelsDevEntry {
  id: string;
  name: string;
  npm: string;
  api?: string;
  models: Record<string, ModelsDevModel>;
}

/** models.dev statuses that mean the model should not be offered in the dropdown. */
const EXCLUDED_MODEL_STATUSES = new Set(['alpha', 'deprecated']);

/**
 * True when a model from the index should be offered: it generates text
 * (output modalities include "text") and is not deprecated/unavailable.
 * Models without mode or status metadata are kept (don't over-filter).
 */
export function isEligibleModel(model: ModelsDevModel): boolean {
  if (model.status && EXCLUDED_MODEL_STATUSES.has(model.status)) return false;
  const out = model.modalities?.output;
  if (Array.isArray(out) && !out.includes('text')) return false;
  return true;
}

/** Map the models.dev index (Record<providerId, entry>) into ProviderDef[]. */
export function adaptIndex(raw: Record<string, ModelsDevEntry>): ProviderDef[] {
  const out: ProviderDef[] = [];
  for (const entry of Object.values(raw)) {
    if (!entry || typeof entry !== 'object' || typeof entry.npm !== 'string') continue;
    const compat = compatFromNpm(entry.npm);
    if (!compat) continue; // unsupported wire format (bedrock, azure, cohere, ...)
    const rawUrl = entry.api;
    if (rawUrl && rawUrl.includes('${')) continue; // env-var-templated URL
    const baseUrl = normalizeBaseUrl(rawUrl ?? DEFAULT_BASE_URLS[entry.id] ?? '', compat);
    if (!baseUrl || !DEFAULT_BASE_URLS[entry.id] && !rawUrl) continue;
    const models = entry.models
      ? Object.keys(entry.models).filter((id) => isEligibleModel(entry.models[id]!))
      : undefined;
    out.push({ id: entry.id, name: entry.name, baseUrl, apiCompatibility: compat, models });
  }
  return out;
}

/** Sort alphabetically by display name. */
export function sortProviders(providers: ProviderDef[]): ProviderDef[] {
  return [...providers].sort((a, b) => a.name.localeCompare(b.name));
}

export function getProviderById(providers: ProviderDef[], id: string): ProviderDef | undefined {
  return providers.find((p) => p.id === id);
}

/** Fetch the provider index, using the cached copy when fresh, else bundled. */
export async function fetchProviderIndex(): Promise<ProviderDef[]> {
  try {
    const got = await browser.storage.local.get(PROVIDERS_INDEX_CACHE_KEY);
    const cached = got[PROVIDERS_INDEX_CACHE_KEY] as { ts?: number; providers?: ProviderDef[] } | undefined;
    if (cached && Array.isArray(cached.providers) && Date.now() - (cached.ts ?? 0) < PROVIDERS_INDEX_TTL_MS) {
      return cached.providers;
    }
  } catch {
    // fall through to fetch
  }
  try {
    const res = await fetch(MODELS_INDEX_URL);
    if (!res.ok) return BUNDLED_PROVIDERS;
    const providers = adaptIndex((await res.json()) as Record<string, ModelsDevEntry>);
    if (providers.length === 0) return BUNDLED_PROVIDERS;
    await browser.storage.local.set({
      [PROVIDERS_INDEX_CACHE_KEY]: { ts: Date.now(), providers },
    });
    return providers;
  } catch {
    return BUNDLED_PROVIDERS;
  }
}

/** Invalidate the cached index so the next call refetches (force-refresh control). */
export async function clearProviderIndexCache(): Promise<void> {
  try {
    await browser.storage.local.remove(PROVIDERS_INDEX_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

type ModelsCache = Record<string, { models: string[]; ts: number }>;

async function readModelsCache(): Promise<ModelsCache> {
  try {
    const got = await browser.storage.local.get(PROVIDER_MODELS_CACHE_KEY);
    const raw = got[PROVIDER_MODELS_CACHE_KEY];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as ModelsCache;
  } catch {
    /* ignore */
  }
  return {};
}

async function writeModelsCache(cacheKey: string, models: string[]): Promise<void> {
  try {
    const map = await readModelsCache();
    map[cacheKey] = { models, ts: Date.now() };
    // Bound the cache (LRU-ish: evict oldest beyond 100 providers).
    const keys = Object.keys(map);
    if (keys.length > 100) {
      keys.sort((a, b) => map[a]!.ts - map[b]!.ts);
      for (const k of keys.slice(0, keys.length - 100)) delete map[k];
    }
    await browser.storage.local.set({ [PROVIDER_MODELS_CACHE_KEY]: map });
  } catch {
    /* ignore */
  }
}

const FETCH_TIMEOUT_MS = 15000;

function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** Live-fetch a provider's models endpoint (undefined when it fails or needs a key). */
async function fetchModelsLive(
  provider: ProviderDef,
  apiKey?: string,
  force = false,
): Promise<string[] | undefined> {
  if (!apiKey) return undefined;
  const cacheKey = `${provider.id}:${provider.baseUrl}`;
  if (!force) {
    try {
      const map = await readModelsCache();
      const hit = map[cacheKey];
      if (hit && Array.isArray(hit.models) && Date.now() - hit.ts < PROVIDER_MODELS_TTL_MS) return hit.models;
    } catch {
      /* ignore */
    }
  }
  try {
    let models: string[] | undefined;
    if (provider.apiCompatibility === 'openai') {
      const res = await fetchWithTimeout(`${provider.baseUrl}/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return undefined;
      const data = (await res.json()) as { data?: { id?: string }[] };
      models = Array.isArray(data.data) ? data.data.map((m) => m?.id).filter((id): id is string => !!id) : undefined;
    } else if (provider.apiCompatibility === 'anthropic') {
      const res = await fetchWithTimeout(`${provider.baseUrl}/models`, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      });
      if (!res.ok) return undefined;
      const data = (await res.json()) as { data?: { id?: string }[] };
      models = Array.isArray(data.data) ? data.data.map((m) => m?.id).filter((id): id is string => !!id) : undefined;
    } else {
      const res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      );
      if (!res.ok) return undefined;
      // Filter to models that can generate content: the list also contains
      // embedding/retrieval-only and TTS models without generateContent.
      const data = (await res.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
      models = Array.isArray(data.models)
        ? data.models
            .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
            .map((m) => (m?.name ?? '').replace(/^models\//, '')).filter(Boolean)
        : undefined;
    }
    if (models && models.length > 0) await writeModelsCache(cacheKey, models);
    return models;
  } catch {
    return undefined;
  }
}

/**
 * Model list for a provider: cached live-fetch first, then remote-index models,
 * then bundled suggestions, then undefined (free-text in the options page).
 * The result is sorted alphabetically for the dropdown.
 */
export async function getProviderModels(
  provider: ProviderDef,
  apiKey?: string,
  force = false,
): Promise<string[] | undefined> {
  const live = await fetchModelsLive(provider, apiKey, force);
  let models: string[] | undefined;
  if (live && live.length > 0) models = live;
  else if (provider.models && provider.models.length > 0) models = provider.models;
  else if (provider.bundledModels && provider.bundledModels.length > 0) models = provider.bundledModels;
  return models ? [...models].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })) : undefined;
}

/** Free-text model id validation (permissive: lowercase alnum + - . : /). */
const MODEL_ID_RE = /^[a-z0-9][a-z0-9-.:/]*$/;
export function isValidModelId(id: string): boolean {
  return MODEL_ID_RE.test(id);
}

/** Custom-provider URL validation: https for remote; http only for localhost; /v1 for openai/anthropic. */
export function isValidCustomUrl(url: string, compat: ApiCompatibility): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.protocol === 'http:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return false;
  if (compat === 'gemini') return true;
  return u.pathname.replace(/\/+$/, '').endsWith('/v1');
}
