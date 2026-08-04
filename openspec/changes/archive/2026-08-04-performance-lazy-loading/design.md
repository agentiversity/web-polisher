## Context

Current flow (phase 3): clicking the action button sends `apply-polish` → `polishContent(hostname)` (`utils/polish.ts`) detects all user-content roots, collects every eligible text node page-wide, sends one `transform-text` batch to the background LLM client, then applies results and marks roots processed. Weaknesses this change addresses:

- All off-screen content is transformed in the same pass as visible content — wasted API budget and one long latency block on long threads.
- No cache: re-scroll or re-trigger re-transforms the same text (only per-page `PROCESSED_ATTR` prevents re-processing).
- Content mounted after the click (Reddit virtualization / infinite scroll) is never transformed.
- No consideration of scroll activity — a big batch can finish mid-scroll and mutate the DOM.

Constraints carried over: on-demand trigger (nothing runs until the click), invisible after trigger, text-node-only DOM writes (React-safe), sequential bounded batches (`BATCH_SIZE=15`, `LLM_TIMEOUT_MS`), quality gate, background-only LLM traffic (MV3 CORS), native DOM APIs only, Firefox MV3.

## Goals / Non-Goals

**Goals:**
- After a click, transform viewport-near content immediately; defer off-screen content and transform it as the user scrolls near it.
- Skip LLM calls for text already polished recently (result cache, background-side).
- Transform user-content roots mounted after the click (infinite scroll / virtualization).
- Keep the page responsive while batches run (no DOM writes mid-scroll; pause work while scrolling).

**Non-Goals:**
- Always-on auto-transformation (the abandoned model). Everything stays click-triggered.
- Changing the quality gate, content detection, or the LLM client's failure policy.
- Exposing cache controls in the options page (clear cache, toggle) — defer unless users need it.
- Multi-tab scheduling, network-aware retries, or offline queueing.

## Decisions

**D1 — Gate work per content root, not per text node.**
`IntersectionObserver` (`rootMargin: '200px 0px'`) observes each detected content root. On intersect, that root's eligible text nodes are collected (existing `collectEligibleTextNodes`) and queued. Observing roots (tens) beats observing text nodes (hundreds/thousands) in observer bookkeeping and matches the existing root-based detection.

**D2 — Initial click pass = "everything currently in/near viewport".**
On `apply-polish`, process all roots whose bounding box intersects the viewport + margin immediately (one batch), then register the remaining roots with the observer. This preserves the current click-to-apply feel (you see the visible thread transform right away) while deferring the long tail. The "Polishing…" modal stays until the first viewport batch is applied; later scroll-driven work is silent (per `user-experience` spec).

**D3 — Background-side LRU result cache in `browser.storage.local`.**
`transform()` in `utils/llmClient.ts` gains a cache lookup keyed by the exact (trimmed) original text. Only cache misses go to the API; hits are returned as `ok:true`. `ok:true` results that pass the quality gate are written back with a timestamp. Bounds: ~1000 entries, 7-day TTL, stored under one key (e.g. `cache:polish:v1`) so each `get`/`set` is a single storage call; prune expired entries and evict least-recently-used past the cap on write. Store on background side so content scripts never touch it and cross-tab misses are shared.

Alternatives: cache in content script per-tab — rejected (per-tab duplicate work, lost on navigation). No cache — rejected (defeats duplicate-processing requirement).

**D4 — `MutationObserver` (subtree, childList) for dynamically mounted roots.**
Active only after the user has clicked. Added nodes are debounced (rAF) and passed through a cheap "looks like content" pre-filter before the full detection heuristics; newly detected roots are registered with the observer. IntersectionObserver auto-unobserves detached elements, so virtualized-out roots drop themselves; re-mounts are re-detected here. Observer is disconnected on `pagehide` and when the pipeline goes idle.

**D5 — Scroll-pause.**
A `scrollPaused` flag is set on `scroll` and cleared ~200 ms after the last scroll. The processing queue drains batches only while not `scrollPaused`, and DOM writes are skipped during a scroll. Batches stay sequential (existing `BATCH_SIZE` loop); this adds ordering, not parallelism.

**D6 — Refactor `polish.ts` into per-root processing.**
Extract `polishRoot(root) → {requested, applied}` (collect → transform → apply → mark processed on that root). `polishContent(hostname)` becomes the pipeline entry point that detects roots, seeds the viewport batch (D2), and wires observers (D1/D4). `PROCESSED_ATTR` marking moves to per-root success. `PolishResult` is extended with pending/remaining counts; the background `apply-polish` reply shape keeps the existing fields so the E2E harness keeps working.

## Risks / Trade-offs

- **MutationObserver cost on heavy pages** → debounced (rAF) + cheap text pre-filter before detection; disconnect when idle or on `pagehide`.
- **Cache storage growth** → bounded cap + TTL, pruned on every write; ~1000 × short strings is well under `storage.local` quota. Stale polished text (author edits then re-polishes) is a known trade-off of text-keyed caching.
- **Virtualized content being observed while off-screen** → IntersectionObserver handles detach; the 200px margin pre-fetches before it becomes visible.
- **Latency with sequential batches under scroll** → scroll-pause + viewport-first ordering bounds perceived delay; long tail finishes as the user scrolls.
- **Firefox content-script lifecycle (globals dropped on navigation)** → pipeline is per-navigation anyway (click → one page); observers die with the old document. No cross-navigation state needed beyond the existing `storage.session` reset.

## Migration Plan

No data migration. No persistent state schema change (cache is self-healing). Rollback = revert the change; old single-pass behavior returns (observers absent). E2E (`e2e/run-e2e.mjs`, `e2e/firefox-e2e.mjs`) must keep passing — the reply shape is preserved and fixture pages are small enough that viewport-gating behaves like a single pass.

## Open Questions

- Should the cache be warmable/pre-loadable from the options page? (Leaning no — YAGNI.)
- 200px pre-fetch margin: keep as a `settings.ts` constant, tunable per site later.
