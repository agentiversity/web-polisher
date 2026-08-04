/**
 * Background-side LLM client (design D1).
 *
 * Content scripts cannot make cross-origin fetches in MV3, so all Gemini API
 * traffic runs through the background service worker. This module reads the
 * configured API key from `browser.storage.local`, constructs a small/cheap
 * Gemini client, and exposes a batched `transform()` that rewrites a list of
 * user texts for naturalness while preserving meaning.
 *
 * Failure policy (design D6): every path degrades to per-item `ok:false` and
 * never throws uncaught — a missing key, network error, timeout, or rate limit
 * leaves the page text untouched rather than corrupting it.
 */

import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from '@google/generative-ai';
import type { GenerativeModel } from '@google/generative-ai';
import { browser } from 'wxt/browser';
import {
  API_KEY_STORAGE_KEY,
  API_MODEL,
  BATCH_SIZE,
  CONFIDENCE_THRESHOLD_KEY,
  DEFAULT_CONFIDENCE_THRESHOLD,
  LLM_TIMEOUT_MS,
  MAX_TEXT_LENGTH,
} from './settings';
import { passesQualityGate } from './quality';

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

/** Read the configured API key from storage.local; undefined when not set. */
export async function getApiKey(): Promise<string | undefined> {
  // Use the bare-key form: Chrome drops keys whose default is `undefined` in the
  // object form, which would make this always return undefined (no-op).
  const got = await browser.storage.local.get(API_KEY_STORAGE_KEY);
  const v = got[API_KEY_STORAGE_KEY];
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
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

/** Construct a Gemini model client from a raw API key. */
export function makeClient(apiKey: string): GenerativeModel {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: API_MODEL });
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

/** Lenient JSON parser for the model's array reply (raw array, or {results|texts}). */
function parseResults(raw: string): string[] | undefined {
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data.map(String);
    if (data && typeof data === 'object') {
      if (Array.isArray(data.results)) return data.results.map(String);
      if (Array.isArray(data.texts)) return data.texts.map(String);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function classifyError(err: unknown): string {
  if (err instanceof GoogleGenerativeAIFetchError && typeof err.status === 'number') {
    if (err.status === 429) return 'rate-limit';
    return `http-${err.status}`;
  }
  if (err instanceof DOMException && err.name === 'AbortError') return 'timeout';
  return 'network';
}

/** Transform one bounded batch through the model; never throws. */
async function transformBatch(
  model: GenerativeModel,
  texts: string[],
  confidenceThreshold: number,
): Promise<TransformResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const resp = await model.generateContent(
      {
        contents: [{ role: 'user', parts: [{ text: buildBatchPrompt(texts) }] }],
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
      },
      { signal: controller.signal },
    );
    const parsed = parseResults(resp.response.text());
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
 * Transform a list of texts via the configured Gemini client.
 *
 * Bounded batches are processed sequentially (design D2/D6) to stay inside rate
 * limits and keep latency sane. Returns a parallel array of per-item results the
 * same length as `texts`. When no API key is configured this short-circuits with
 * `ok:false, error:'not-configured'` for every item and makes no HTTP call.
 */
export async function transform(texts: string[]): Promise<TransformResult[]> {
  let apiKey: string | undefined;
  try {
    apiKey = await getApiKey();
  } catch {
    // If the key can't be read, assume none is configured — never call the API.
    apiKey = undefined;
  }
  if (!apiKey) {
    return texts.map(() => ({ ok: false, text: '', error: 'not-configured' }));
  }
  const confidenceThreshold = await getConfidenceThreshold();
  const model = makeClient(apiKey);
  const results: TransformResult[] = [];
  for (const batch of chunk(texts, BATCH_SIZE)) {
    // Drop oversize items from a batch silently (defensive cost guard).
    const bounded = batch.map((t) => (t.length > MAX_TEXT_LENGTH ? t.slice(0, MAX_TEXT_LENGTH) : t));
    results.push(...(await transformBatch(model, bounded, confidenceThreshold)));
  }
  return results;
}
