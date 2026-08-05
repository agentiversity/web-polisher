## 1. Carry the score through the result and cache

- [x] 1.1 Add `confidence?: number` to `TransformResult` in `utils/llmClient.ts`, set from the gate's `confidenceScore` for ok results
- [x] 1.2 Persist `confidence` in `CacheRecord` (`utils/cache.ts`); `getCached` returns the record and `transform` restores it on cache hits

## 2. Display in the page UI

- [x] 2.1 `utils/polish.ts`: set `data-confidence` on the highlight span and include the score in the tooltip
- [x] 2.2 `entrypoints/content.ts`: injected stylesheet renders the score badge via `.text-polished[data-confidence]::after`
- [x] 2.3 Add a diagnostic console breakdown when applied < requested

## 3. Tests & verification

- [x] 3.1 Update `cache` tests for the record return + confidence field
- [x] 3.2 Update `llmClient` result assertions to include confidence
- [x] 3.3 Add a `polish` test asserting `data-confidence` and the tooltip
- [x] 3.4 `npm run compile` and `npm test` green

## 4. Threshold clamp & clearer wording

- [x] 4.1 Clamp the threshold to a 0-90 max (MAX_CONFIDENCE_THRESHOLD) across settings/optionsModel/llmClient
- [x] 4.2 Rewrite the options-page help text to explain higher = fewer texts changed
- [x] 4.3 Update clamp tests and add the quality-and-confidence spec delta

