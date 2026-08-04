/**
 * Deterministic quality gate for LLM output (design Q-D2).
 *
 * Runs in the background right after the model reply, per item: a confidence
 * score from multiset Dice token-overlap (0–100) plus a length-fidelity bound.
 * Results below the configured threshold are rejected (`ok:false`) so the
 * original text is kept and never reaches the page or the highlight span.
 *
 * Deliberately local and cheap: no second LLM call, no embeddings, no model
 * self-reported confidence.
 */

/** Allowed polished/original length ratio; outside this the rewrite is
 *  considered truncated or exploded and fails the gate outright. */
export const MIN_LENGTH_RATIO = 0.5;
export const MAX_LENGTH_RATIO = 1.5;

/** Normalize a string into lowercase word tokens (punctuation stripped). */
export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean);
}

/** Multiset Dice coefficient (0–1) between two token lists; 1 when both empty. */
export function diceSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const t of a) counts.set(t, (counts.get(t) ?? 0) + 1);
  let shared = 0;
  for (const t of b) {
    const n = counts.get(t) ?? 0;
    if (n > 0) {
      shared++;
      if (n === 1) counts.delete(t);
      else counts.set(t, n - 1);
    }
  }
  return (2 * shared) / (a.length + b.length);
}

/**
 * Confidence score 0–100 for a polished result: token-overlap similarity,
 * zeroed when the length ratio is out of bounds (truncation/explosion guard).
 */
export function confidenceScore(original: string, polished: string): number {
  const ol = original.length;
  if (ol > 0) {
    const ratio = polished.length / ol;
    if (ratio < MIN_LENGTH_RATIO || ratio > MAX_LENGTH_RATIO) return 0;
  }
  return Math.round(100 * diceSimilarity(tokenize(original), tokenize(polished)));
}

/** True when a polished result is good enough to apply (inclusive boundary). */
export function passesQualityGate(original: string, polished: string, threshold: number): boolean {
  return confidenceScore(original, polished) >= threshold;
}
