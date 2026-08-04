/**
 * Background-side LLM client (design D1, generalized per generalize-llm-provider-model).
 *
 * Content scripts cannot make cross-origin fetches in MV3, so all LLM API
 * traffic runs through the background service worker. This module reads the
 * single active config (`llm:config`) from `browser.storage.local`, dispatches
 * to the configured provider — Gemini via the @google/generative-ai SDK,
 * OpenAI/Anthropic-compatible via raw fetch (`utils/apiClient.ts`) — and
 * exposes a batched `transform()` that rewrites a list of user texts for
 * naturalness while preserving meaning.
 *
 * Failure policy (design D6): every path degrades to per-item `ok:false` and
 * never throws uncaught — a missing config, network error, timeout, or rate
 * limit leaves the page text untouched rather than corrupting it.
 */

import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from '@google/generative-ai';
import { browser } from 'wxt/browser';
import {
  BATCH_SIZE,
  CONFIDENCE_THRESHOLD_KEY,
  DEFAULT_CONFIDENCE_THRESHOLD,
  LLM_CONFIG_KEY,
  LLM_TIMEOUT_MS,
  MAX_TEXT_LENGTH,
  type ApiCompatibility,
  type LlmConfig,
} from './settings';
import { passesQualityGate } from './quality';
import { getCached, loadCache, saveCache, setCached } from './cache';
import { ApiHttpError, anthropicChat, openAiChat } from './apiClient';

/** Per-item result of a batch transform. `text` is only meaningful when `ok`. */
export interface TransformResult {
  ok: boolean;
  text: string;
  /** Reason when `ok` is false: not-configured | timeout | rate-limit | network | http-<n> | internal | low-confidence. */
  error?: string;
}

/**
 * System instruction constraining meaning (design D4): rewrite for naturalness
 * and fluency in idiomatic English, preserve meaning/intent/facts, leave
 * already-natural or too-short text unchanged, and return the original verbatim
 * when nothing improves.
 */
const SYSTEM_PROMPT = [
  'You polish user-generated English text into natural, native-sounding English.',
  'Rewrite for fluency and naturalness — go beyond grammar and spelling.',
  'Strictly preserve the meaning, intent, and facts of the original. Do NOT add, remove, or change information.',
  'Keep the same tone and formality as the original.',
  'If the text is already natural, or is too short/trivial to improve confidently, return it verbatim unchanged.',
  'Return EXACTLY one rewritten string per input item, in the same order.',
].join(' ');

/**
 * Read the single active LLM config from storage.local; undefined when not set
 * (which means "not configured" — no API call may be made).
 */
export async function getLlmConfig(): Promise<LlmConfig | undefined> {
  try {
    // Bare-key form: Chrome drops keys whose default is `undefined` in the
    // object form.
    const got = await browser.storage.local.get(LLM_CONFIG_KEY);
    const c = got[LLM_CONFIG_KEY] as Partial<LlmConfig> | undefined;
    if (c && typeof c === 'object' && typeof c.apiKey === 'string' && c.apiKey.trim() && typeof c.model === 'string' && c.model.trim()) {
      return {
        providerId: typeof c.providerId === 'string' ? c.providerId : 'custom',
        customName: typeof c.customName === 'string' ? c.customName : undefined,
        baseUrl: typeof c.baseUrl === 'string' ? c.baseUrl : undefined,
        apiCompatibility: (c.apiCompatibility ?? 'gemini') as ApiCompatibility,
        model: c.model.trim(),
        apiKey: c.apiKey.trim(),
      };
    }
  } catch {
    // Storage unavailable — treat as not configured.
  }
  return undefined;
}

/**
 * Read the user's confidence threshold (0–100) from storage.local; the
 * conservative default applies when absent or invalid. Clamped to 0–100.
 */
export async function getConfidenceThreshold(): Promise<number> {
  try {
    const got = await browser.storage.local.get(CONFIDENCE_THRESHOLD_KEY);
    const v = got[CONFIDENCE_THRESHOLD_KEY];
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) {
      return Math.min(100, Math.max(0, n));
    }
  } catch {
    // Fall through to the default; a threshold read failure must never throw.
  }
  return DEFAULT_CONFIDENCE_THRESHOLD;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildBatchPrompt(texts: string[]): string {
  return (
    `Return a JSON object with a single "results" key whose value is an array of exactly ` +
    `${texts.length} strings — the polished version of each item below, in the same order. ` +
    `Keep an item verbatim when nothing improves.\n\n` +
    JSON.stringify(texts)
  );
}

/** Find the outermost JSON array in a text reply (Anthropic returns prose/text, not JSON). */
function extractJsonArray(text: string): unknown | undefined {
  const start = text.indexOf('[');
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let quote = '';
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

function pickStringArray(data: unknown): string[] | undefined {
  if (Array.isArray(data)) return data.filter((x): x is string => typeof x === 'string');
  if (data && typeof data === 'object') {
    const rec = data as Record<string, unknown>;
    if (Array.isArray(rec.results)) return rec.results.filter((x): x is string => typeof x === 'string');
    if (Array.isArray(rec.texts)) return rec.texts.filter((x): x is string => typeof x === 'string');
  }
  return undefined;
}

/** Lenient JSON parser for the model's array reply: raw JSON, {results|texts}, or prose-wrapped. */
function parseResults(raw: string): string[] | undefined {
  try {
    const parsed = pickStringArray(JSON.parse(raw));
    if (parsed !== undefined) return parsed;
  } catch {
    // fall through to the prose/array extraction
  }
  return pickStringArray(extractJsonArray(raw));
}

function classifyError(err: unknown): string {
  if (err instanceof ApiHttpError) {
    return err.status === 429 ? 'rate-limit' : `http-${err.status}`;
  }
  if (err instanceof GoogleGenerativeAIFetchError && typeof err.status === 'number') {
    if (err.status === 429) return 'rate-limit';
    return `http-${err.status}`;
  }
  if (err instanceof DOMException && err.name === 'AbortError') return 'timeout';
  return 'network';
}

/** One bounded batch through the configured provider; never throws. */
async function transformBatch(
  config: LlmConfig,
  texts: string[],
  confidenceThreshold: number,
): Promise<TransformResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const prompt = buildBatchPrompt(texts);
    let raw: string;
    if (config.apiCompatibility === 'gemini') {
      const genAI = new GoogleGenerativeAI(config.apiKey);
      const model = genAI.getGenerativeModel({ model: config.model });
      const resp = await model.generateContent(
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          systemInstruction: SYSTEM_PROMPT,
          generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
        },
        { signal: controller.signal },
      );
      raw = resp.response.text();
    } else if (config.apiCompatibility === 'anthropic') {
      raw = await anthropicChat(config.baseUrl ?? '', config.model, prompt, config.apiKey, controller.signal, SYSTEM_PROMPT);
    } else {
      raw = await openAiChat(config.baseUrl ?? '', config.model, prompt, config.apiKey, controller.signal, SYSTEM_PROMPT);
    }
    const parsed = parseResults(raw);
    return texts.map((original, i) => {
      const candidate = parsed?.[i];
      if (candidate === undefined || candidate === null) {
        return { ok: false, text: '', error: 'internal' };
      }
      const trimmed = candidate.trim();
      if (!trimmed) return { ok: false, text: '', error: 'internal' };
      // Quality gate (quality-and-confidence): reject rewrites that score below
      // the configured threshold or that collapsed/exploded in length — the
      // original is kept and never reaches the page or the highlight span.
      // Verbatim/near-verbatim output scores ~100 and passes, to be dropped
      // later by the display gate in polish.ts.
      if (!passesQualityGate(original, trimmed, confidenceThreshold)) {
        return { ok: false, text: '', error: 'low-confidence' };
      }
      return { ok: true, text: trimmed };
    });
  } catch (err) {
    const error = classifyError(err);
    return texts.map(() => ({ ok: false, text: '', error }));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Transform a list of texts via the configured provider.
 *
 * Bounded batches are processed sequentially (design D2/D6) to stay inside rate
 * limits and keep latency sane. Returns a parallel array of per-item results the
 * same length as `texts`. When no config is present this short-circuits with
 * `ok:false, error:'not-configured'` for every item and makes no HTTP call.
 *
 * A result cache (design D3) is consulted per original text: hits return without
 * an API call, misses are transformed and written back (only results that pass
 * the quality gate are cached). Cache failures never break the transform.
 */
export async function transform(texts: string[]): Promise<TransformResult[]> {
  let config: LlmConfig | undefined;
  try {
    config = await getLlmConfig();
  } catch {
    config = undefined;
  }
  if (!config) {
    return texts.map(() => ({ ok: false, text: '', error: 'not-configured' }));
  }
  const confidenceThreshold = await getConfidenceThreshold();
  const cache = await loadCache();
  const results: TransformResult[] = [];
  for (const batch of chunk(texts, BATCH_SIZE)) {
    // Drop oversize items from a batch silently (defensive cost guard).
    const bounded = batch.map((t) => (t.length > MAX_TEXT_LENGTH ? t.slice(0, MAX_TEXT_LENGTH) : t));
    const batchResults: TransformResult[] = [];
    const missIndexes: number[] = [];
    const missTexts: string[] = [];
    bounded.forEach((t, i) => {
      const hit = getCached(cache, t);
      if (hit !== undefined) {
        batchResults[i] = { ok: true, text: hit };
      } else {
        missIndexes.push(i);
        missTexts.push(t);
      }
    });
    if (missTexts.length > 0) {
      const missResults = await transformBatch(config, missTexts, confidenceThreshold);
      missResults.forEach((r, k) => {
        const idx = missIndexes[k]!;
        batchResults[idx] = r;
        if (r.ok && r.text) setCached(cache, missTexts[k]!, r.text);
      });
    }
    results.push(...batchResults);
  }
  await saveCache(cache);
  return results;
}

/**
 * Validate a candidate config with a minimal chat completion ("Reply with
 * exactly: ok"). Used by the options-page "Test connection" button; never
 * persists anything. Returns a normalized failure reason on error.
 */
export async function testConnection(config: LlmConfig): Promise<{ ok: boolean; reason?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const prompt = 'Reply with exactly: ok';
    if (config.apiCompatibility === 'gemini') {
      const genAI = new GoogleGenerativeAI(config.apiKey);
      const model = genAI.getGenerativeModel({ model: config.model });
      await model.generateContent(
        { contents: [{ role: 'user', parts: [{ text: prompt }] }] },
        { signal: controller.signal },
      );
    } else if (config.apiCompatibility === 'anthropic') {
      await anthropicChat(config.baseUrl ?? '', config.model, prompt, config.apiKey, controller.signal);
    } else {
      await openAiChat(config.baseUrl ?? '', config.model, prompt, config.apiKey, controller.signal);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: classifyError(err) };
  } finally {
    clearTimeout(timer);
  }
}
