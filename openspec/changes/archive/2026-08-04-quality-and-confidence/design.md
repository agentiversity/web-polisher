## Context

Phases 1–3 built the trigger (`user-actions`), the React-safe text-node
replacer (`textReplacer.ts`), content detection (`contentDetector.ts` /
`domWalk.ts`), and a real Gemini rewrite piped through the background worker
(`llmClient.ts` → `polish.ts`). The `llm-transformation-engine` design (D4)
explicitly deferred confidence scoring to this phase: its only protections are
the prompt-level "return verbatim when nothing improves" instruction and the
display gate `isMeaningfullyChanged`. Nothing scores quality, so a degraded
rewrite would currently be applied. This design adds that gate.

## Goals / Non-Goals

**Goals:**
- A deterministic, cheap quality gate between the LLM reply and the page:
  token-overlap similarity + length fidelity, computed per item in the
  background client.
- Below-threshold results are `ok:false` and never reach the page or the
  highlight span — the original is kept (spec: "Failed quality gate shows
  original").
- A user-tunable threshold (0–100, default 50) persisted in
  `browser.storage.local`, editable from the existing options page.
- Zero additional LLM calls; no changes to the content script.

**Non-Goals:**
- Semantic/embedding-based similarity (requires a second model call — cost).
- Model self-reported confidence (extra tokens, unreliable calibration).
- Per-site or per-text-type threshold tuning.
- The display gate (`isMeaningfullyChanged`) already handles whitespace/case/
  punctuation-only diffs; it stays as-is and runs after the quality gate.

## Decisions

**D1 — Gate runs in the background, per item, right after the model reply.**
`transformBatch` scores every `(original, polished)` pair and returns
`{ ok: false, error: 'low-confidence' }` for results below the threshold.
*Why:* the raw reply lives only in the background; per-item rejection reuses
the existing `ok:false` path, so `polish.ts`/`content.ts` need zero changes.
Rejected items keep the original and produce no highlight span.

**D2 — Confidence = multiset Dice token overlap + length fidelity.**
Normalize both strings (lowercase, strip punctuation, split on whitespace),
compute the multiset Dice coefficient (2 × shared-token-min-sums / total
tokens) scaled to 0–100, and require the polished length to be within
0.5×–1.5× of the original (truncation/explosion guard). *Alternative
rejected:* embedding similarity — extra LLM/embedding call, not worth the cost
for naturalness rewrites that mostly preserve words.

**D3 — Threshold is a persisted 0–100 number, default 50.**
New constant `CONFIDENCE_THRESHOLD_KEY = 'confidence:threshold'` and
`DEFAULT_CONFIDENCE_THRESHOLD = 50` in `utils/settings.ts`. The background
reads it per `transform()` call (like the API key) with the default when
absent — no migration needed for existing installs. The options page gains a
number input; save writes `storage.local`, load prefills it.

**D4 — Gate order: quality gate, then display gate.**
Quality gate decides *whether the rewrite is applied at all*; the existing
`isMeaningfullyChanged` decides *whether a highlight span is created*. A
verbatim or punctuation-only result scores ~100, passes the quality gate, and
is then dropped by the display gate (original kept, no span) — unchanged
behavior.

**D5 — Conservative default, verified against real rewrites.**
The e2e fixture's actual Gemini rewrites score 0.6–0.7 similarity; 50/100
safely admits them while rejecting off-topic/truncated output. Threshold is
user-raisable for stricter behavior.

## Risks / Trade-offs

- [Threshold rejects good rewrites] → Default 50 is conservative and verified
  against live rewrites; user-tunable (D3). Raising it only tightens.
- [Token-overlap favors word-preserving rewrites] → Acceptable: naturalness
  rewrites typically preserve most words. Embedding scoring deferred.
- [Length bound too tight] → 0.5×–1.5× tolerates condensation and expansion;
  constants are tunable.
- [Options page grows] → One number input; existing key field untouched.
- [Legacy stored value] → None: absent key falls back to the default.

## Migration Plan

No data migration. The options page loads the threshold (default when absent);
the background reads it per request. Existing saved API keys are unaffected.

## Open Questions

None blocking. Default threshold and length bounds are tunable constants that
don't change specs or the approach.
