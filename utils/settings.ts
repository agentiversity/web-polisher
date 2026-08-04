/**
 * Shared tunable constants for the LLM transformation engine.
 *
 * Both the background worker (`llmClient.ts`) and the options page read the
 * API-key storage key and model/limits from here so the two never drift
 * apart. These are product constants, not per-user state.
 */

/** Storage key under which the user's Gemini API key is persisted (storage.local). */
export const API_KEY_STORAGE_KEY = 'gemini:apiKey';

/** Gemini model used for transformation (small/cheap Flash tier).
 *  gemini-3.1-flash-lite is the high-throughput, lowest-cost Flash tier on the
 *  free tier (older 2.0/2.5-flash names 404 on current projects). Tunable per
 *  account — see the models list at /v1beta/models with a key. */
export const API_MODEL = 'gemini-3.1-flash-lite';

/** Minimum trimmed text length before a node is considered transformable. */
export const MIN_TEXT_LENGTH = 12;

/** Maximum text length sent to the model (protects payload/cost). */
export const MAX_TEXT_LENGTH = 2000;

/** Max texts per single API request (bounded batch, design D2). */
export const BATCH_SIZE = 15;

/** Per-request timeout before a batch degrades to a graceful no-op. */
export const LLM_TIMEOUT_MS = 25000;

/** Storage key for the user's confidence threshold (0–100, quality-and-confidence). */
export const CONFIDENCE_THRESHOLD_KEY = 'confidence:threshold';

/** Default confidence threshold: conservative, admits word-preserving rewrites. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 50;
