/**
 * Shared tunable constants for the LLM transformation engine.
 *
 * Both the background worker (`llmClient.ts`) and the options page read the
 * config key, provider index, and limits from here so the two never drift
 * apart. These are product constants, not per-user state.
 */

/** Storage key under which the single active LLM config is persisted (storage.local). */
export const LLM_CONFIG_KEY = 'llm:config';

/** Storage key for the cached well-known providers index (storage.local). */
export const PROVIDERS_INDEX_CACHE_KEY = 'providers:index';

/** How long the fetched provider index stays cached before refresh. */
export const PROVIDERS_INDEX_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** Remote index of well-known providers + their models (models.dev powers opencode). */
export const MODELS_INDEX_URL = 'https://models.dev/api.json';

/** Storage key for per-provider model lists fetched live from providers. */
export const PROVIDER_MODELS_CACHE_KEY = 'providers:models';

/** How long a live-fetched model list stays cached before refresh. */
export const PROVIDER_MODELS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** API wire formats the client can speak. */
export type ApiCompatibility = 'openai' | 'anthropic' | 'gemini';

/** Default Gemini model, used to seed configs in tests/E2E and as the Google bundle default. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';

/** The single active provider/model/key configuration. */
export interface LlmConfig {
  /** Provider id from the registry, or 'custom'. */
  providerId: string;
  /** Display name when providerId === 'custom'. */
  customName?: string;
  /** Base URL for custom providers (openai/anthropic: ends /v1; gemini: API root). */
  baseUrl?: string;
  apiCompatibility: ApiCompatibility;
  model: string;
  apiKey: string;
}

/** Minimum trimmed text length before a node is considered transformable. */
export const MIN_TEXT_LENGTH = 12;

/** Maximum text length sent to the model (protects payload/cost). */
export const MAX_TEXT_LENGTH = 2000;

/**
 * Max texts per single API request (bounded batch, design D2). A small batch
 * keeps latency low and lets per-item results be applied as soon as the batch
 * returns, while still amortizing request overhead across multiple text nodes.
 * The content script sends+applies one batch at a time.
 */
export const BATCH_SIZE = 8;

/** Per-request timeout before a batch degrades to a graceful no-op. */
export const LLM_TIMEOUT_MS = 60000;

/** Storage key for the user's confidence threshold (0–100, quality-and-confidence). */
export const CONFIDENCE_THRESHOLD_KEY = 'confidence:threshold';

/** Default confidence threshold: conservative, admits word-preserving rewrites. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 50;

/**
 * Maximum confidence threshold. Kept below 100: at 100 only verbatim output
 * would pass the gate, which is then dropped as "unchanged" — the extension
 * would silently stop rewriting anything.
 */
export const MAX_CONFIDENCE_THRESHOLD = 90;

/** Storage key for the polished-result cache (one object, storage.local). */
export const CACHE_KEY = 'cache:polish:v1';

/** Cache entry lifetime before a stored rewrite is re-requested. */
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Max cached entries; LRU-pruned past this cap. */
export const CACHE_MAX_ENTRIES = 1000;

/** How far past the viewport edge content is pre-fetched (performance, D1). */
export const VIEWPORT_MARGIN_PX = 200;

/** Quiet window after the last scroll during which DOM writes are deferred. */
export const SCROLL_PAUSE_MS = 200;

/** Debounce for MutationObserver-triggered re-detection of new content roots. */
export const MUTATION_SCAN_DELAY_MS = 250;

/**
 * Upper bound for the idle backoff: when scans keep finding nothing new, the
 * delay between scans doubles up to this cap so a churny page stops costing CPU.
 */
export const MUTATION_SCAN_BACKOFF_MAX_MS = 5000;
