## Why

Today a click transforms every detected content root on the page at once (`polishContent` collects all eligible text nodes in one batch). On long threads this means large payloads, LLM budget spent on far off-screen comments, one long block of API latency, and re-transformation on every re-scroll (no cache, only per-page `PROCESSED_ATTR` idempotency). Dynamically mounted content (Reddit's virtualized/infinite-scroll comments) added after the click is never transformed.

## What Changes

- **Viewport-gated processing after the click**: transform viewport-near content first; defer off-screen content and process it as the user scrolls near it (IntersectionObserver, 200px pre-fetch margin). One click still starts the pipeline; no further interaction is required once triggered.
- **LRU result cache**: background-side cache in `browser.storage.local` keyed by original text (bounded ~1000 entries, 7-day TTL) so re-scrolling or re-encountering the same text reuses the polished result instead of re-calling the LLM.
- **Dynamic-content pickup**: a `MutationObserver` re-detects user-content roots mounted after the click (infinite scroll / virtualization) and transforms them when they enter the viewport.
- **Scroll-jank guard**: scroll-triggered work is queued and paused while the user is actively scrolling; sequential batching (already in place) is kept, and no DOM writes happen during a scroll.
- **No behavior change to the trigger model**: nothing transforms and no LLM calls happen until the user clicks the toolbar button.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `performance`: refine the existing spec'd capability to the on-demand, click-triggered flow and make the cache, concurrency limits, and dynamic-content handling explicit (the current spec was written against the abandoned always-on model and reads "process as content approaches viewport" as if the extension were continuously active).

## Impact

- **Modified files**: `utils/polish.ts` (viewport-gated orchestration + scroll scheduling), `entrypoints/content.ts` (IntersectionObserver/MutationObserver setup), `utils/llmClient.ts` (cache read/write), `utils/settings.ts` (cache constants, pre-fetch margin), `README.md` (roadmap/status), openspec specs.
- **New files**: `utils/cache.ts` (bounded LRU with TTL over `browser.storage.local`), plus tests (`cache.test.ts`, extended `polish`/integration coverage).
- **Dependencies**: none (native `IntersectionObserver`, `MutationObserver`, `browser.storage`).
- **No change** to content detection, text-node replacement, the quality gate, or the LLM client's failure policy.
