## 1. Scoring (`utils/quality.ts`)

- [x] 1.1 Tokenizer: lowercase, strip punctuation, split on whitespace; multiset counts
- [x] 1.2 Dice similarity over token multisets, scaled to 0–100
- [x] 1.3 Length-fidelity check (polished length within 0.5×–1.5× of original)
- [x] 1.4 `passesQualityGate(original, polished, threshold)` combining both

## 2. Wire the gate into the transform path

- [x] 2.1 Add `CONFIDENCE_THRESHOLD_KEY` + `DEFAULT_CONFIDENCE_THRESHOLD` to `utils/settings.ts`
- [x] 2.2 Read the threshold in `llmClient.transform` (default when absent); pass to `transformBatch`
- [x] 2.3 In `transformBatch`: score each `(original, candidate)`; below threshold → `{ ok:false, error:'low-confidence' }`

## 3. Options page

- [x] 3.1 Number input (0–100) in the options page, pre-filled on open, saved to `storage.local` on submit

## 4. Tests & build

- [x] 4.1 Unit tests: identical, disjoint, word-preserving rewrites, length collapse/explosion, boundary threshold
- [x] 4.2 `llmClient` gate tests: below threshold rejected (`low-confidence`), above accepted
- [x] 4.3 Threshold storage round-trip (default, clamp, invalid) via `getConfidenceThreshold` unit tests
- [x] 4.4 Type-check (`npm run compile`) and full unit suite green
- [x] 4.5 Chrome e2e green with the gate active (`npm run test:e2e`)
- [x] 4.6 Firefox build clean (`npm run build:firefox`)
