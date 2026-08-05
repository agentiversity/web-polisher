## Why

The extension already computes a quality-gate confidence score (0–100) for every applied rewrite, but never shows it. Without it the user cannot tell how faithful a rewrite is, or why some text was left unchanged.

## What Changes

- Each applied rewrite's highlight span shows its quality-gate confidence score as a small inline badge.
- The rewrite's tooltip shows the confidence score alongside the original text.
- The score is persisted in the result cache so cached rewrites display it too.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities
- `user-experience`: Applied rewrites now surface their confidence score in the page UI (badge + tooltip).

## Impact

- `utils/llmClient.ts`: `TransformResult` carries `confidence` (already computed by the quality gate); cache hits reuse the stored score.
- `utils/cache.ts`: `CacheRecord` stores the score; `getCached` returns the record.
- `utils/polish.ts`: the highlight span gets `data-confidence` and a tooltip including the score; adds a diagnostic log when fewer nodes than requested are applied.
- `entrypoints/content.ts`: injected stylesheet renders the score badge via `.text-polished[data-confidence]::after`.
- Tests: `cache`, `llmClient`, `polish` suites updated/extended.
