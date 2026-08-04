## Why

Phase 3 (`llm-transformation-engine`) wired a real Gemini rewrite into the
click-to-apply pipeline, but its design explicitly deferred confidence scoring
to this phase (design D4, "alternative rejected: rely on confidence scoring —
that's Phase 5"). Today the only protections are prompt-level ("return the
original verbatim when nothing improves") and the display gate
`isMeaningfullyChanged` (whitespace/case/punctuation-only differences). Nothing
scores output quality, so a degraded, off-topic, or truncated rewrite would be
applied to the page as-is. The product principle (openspec/config.yaml) is
explicit: "Small/cheap LLMs only; abort transformations below a confidence
threshold." This phase makes that principle real.

## What Changes

- Add a deterministic **post-LLM quality gate** in the background client
  (`utils/llmClient.ts`): for each polished result, compute a confidence score
  (multiset Dice token-overlap similarity in 0–100 plus a length-fidelity
  bound) and reject results below the configured threshold with `ok:false`.
  Rejected items keep the original text and never reach the page or the
  highlight span.
- Make the threshold **user-tunable**: a 0–100 value persisted in
  `browser.storage.local` (`confidence:threshold`), editable from the existing
  options page, with a conservative default of 50.
- **No extra LLM calls**: scoring is local and cheap (token sets, length
  ratio). Semantic/embedding-based scoring and model self-reported confidence
  are out of scope (extra cost, unreliable calibration).

## Capabilities

### Modified Capabilities
- `quality-and-confidence`: implements both existing requirements — abort
  transformations below a configurable threshold, and evaluate quality
  (similarity + length fidelity) before any text is applied.

## Impact

- **New files**: `utils/quality.ts` (similarity scoring + gate), `utils/quality.test.ts`.
- **Modified files**: `utils/llmClient.ts` (per-item gate in `transformBatch`),
  `utils/settings.ts` (threshold storage key + default), `utils/llmClient.test.ts`,
  `entrypoints/options/index.ts` + options markup/CSS (threshold input).
- **No change** to `entrypoints/content.ts` / `utils/polish.ts`: rejected items
  already flow through the existing `ok:false` per-item path, so the content
  side is untouched.
