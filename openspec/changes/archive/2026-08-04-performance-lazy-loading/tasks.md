## 1. Result cache (background)

- [x] 1.1 Add `utils/cache.ts`: bounded LRU over `browser.storage.local` under one key (`cache:polish:v1`), entries `{text → {polished, ts}}`, with TTL (7 days) and cap (~1000) pruning on write, `get`, `set`, and touch-on-read LRU ordering
- [x] 1.2 Add cache constants to `utils/settings.ts` (`CACHE_KEY`, `CACHE_TTL_MS`, `CACHE_MAX_ENTRIES`)
- [x] 1.3 Integrate cache into `transform()` in `utils/llmClient.ts`: serve hits as `ok:true`, send only misses to the API, write back `ok:true` results that pass the quality gate; keep failure policy unchanged
- [x] 1.4 Unit tests: `utils/cache.test.ts` (LRU eviction, TTL expiry, cap bound, corrupt-data resilience) and extend `llmClient.test.ts` for cache-hit/cache-miss merge

## 2. Per-root polish refactor

- [x] 2.1 Extract `polishRoot(root)` in `utils/polish.ts` (collect eligible nodes → `transform-text` → apply → `markProcessed` on that root only); keep `polishContent(hostname)` as the pipeline entry that detects roots and runs the initial pass
- [x] 2.2 Preserve `PolishResult` shape (add optional pending/remaining fields) and the `apply-polish` reply so E2E harnesses keep working
- [x] 2.3 Update `utils/polish.test.ts` and `live.integration.test.ts` for the per-root path

## 3. Viewport-gated lazy processing

- [x] 3.1 Add `VIEWPORT_MARGIN_PX` (200) to `utils/settings.ts`
- [x] 3.2 On trigger, process all roots intersecting viewport + margin immediately (existing batch flow), register remaining roots with an `IntersectionObserver` (`rootMargin: '200px 0px'`) that queues `polishRoot` on intersect
- [x] 3.3 Keep the "Polishing…" modal visible until the first viewport batch applies, then silent for scroll-driven work
- [x] 3.4 Tests: polish pipeline test for in-view-first / deferred behavior

## 4. Scroll-jank guard

- [x] 4.1 Implement `scrollPaused` state in the content script: set on `scroll`, cleared 200ms after last scroll; drain the processing queue only while not paused and skip DOM writes mid-scroll
- [x] 4.2 Test: queue ordering + pause behavior

## 5. Dynamic content pickup

- [x] 5.1 Wire a `MutationObserver` (subtree, childList) active only after trigger; debounce via rAF, cheap text pre-filter, re-run detection on added subtrees, register new roots with the observer
- [x] 5.2 Disconnect the observer on `pagehide` and when the pipeline goes idle
- [x] 5.3 Test: newly-mounted root gets transformed; re-added root reuses cache (no second LLM call)

## 6. Integration & docs

- [x] 6.1 Wire trigger flow in `entrypoints/content.ts` (initial pass + observers + scroll guard); keep WebDriver bridge (`data-text-polisher-*`) working
- [x] 6.2 Update README roadmap/status (Phase 4 complete) and project structure
- [x] 6.3 Run `npm run compile`, full `npm test`, and the Firefox E2E harness (`npm run test:firefox` with a fixture)
- [x] 6.4 Sync delta specs to main specs and archive the change (`openspec validate`, then archive)

