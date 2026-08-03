## Context

See `proposal.md` (Why). Phases 1–2 built the trigger (`user-actions`), the React-safe text-node replacer and mark-based idempotency (`textReplacer.ts`), and content detection that collects visible user-content roots (`contentDetector.ts`/`domWalk.ts`). The current transform is a deterministic `[text-polisher] …` prefix. This design replaces that placeholder with a real LLM transform, reusing the existing detection and DOM machinery unchanged.

## Goals / Non-Goals

**Goals:**
- Real natural-language rewrite of detected user-content text via Gemini Flash, applied in place to the same text nodes.
- All LLM traffic through the background service worker (MV3 CORS).
- An options page for the user's API key, persisted in `browser.storage.local`.
- No LLM call and no page change when no key is configured; no corruption when a call fails.
- Keep the existing click-to-apply trigger and `data-text-polished` idempotency.

**Non-Goals:**
- Confidence scoring / quality gates (Phase 5, `quality-and-confidence`).
- Lazy loading and dynamic-content re-detection (Phase 4, `performance`).
- Local/on-device LLM (WebLLM) — v2.
- Multi-provider UI; only Gemini via `@google/generative-ai` for now.

## Decisions

**D1 — LLM client lives in the background service worker, driven by a `transform-text` message.**
Content scripts cannot do cross-origin fetch in MV3, so `utils/llmClient.ts` (using `@google/generative-ai`) runs in `background.ts`. The content script sends `{ type: 'transform-text', texts: string[] }` and receives a parallel array of `{ ok, result }` per input. *Alternative rejected:* calling the API inline in content — blocked by CORS/architecture.

**D2 — Batch transformations per request.** A page can have dozens of comment bodies; one request per text node is slow and costlier. The content script groups collected text into bounded batches (single parallel request per click is simplest for v1; batching a bounded set keeps payload/size and latency sane). *Alternative:* streaming per-item — deferred; not needed for the on-demand click model.

**D3 — Collect-then-apply, reusing text nodes.** To stay React-safe (`textReplacer.ts` principle), `utils/polish.ts` runs detection (existing `findUserContentRoots`), walks each root collecting eligible text nodes, sends the batch to the background, and writes the returned polished text back to the **same** node objects. Before applying each result it verifies the node is still connected and unmarked; failures keep the original.

**D4 — Prompt constrains meaning.** A single system prompt requests: rewrite for naturalness/fluency in idiomatic English, preserve meaning/intent/facts, leave already-natural or too-short text unchanged, and return the original verbatim when nothing improves. *Alternative:* rely on confidence scoring — that's Phase 5, out of scope.

**D5 — API key in `browser.storage.local` via an options page.** `entrypoints/options/` (vanilla HTML/CSS/JS per project convention) reads/writes the key. The background reads the key at request time (never stores it elsewhere). *Alternative:* `storage.session` — does not persist across sessions.

**D6 — Graceful failure bound.** Each background response carries per-item status; the content script applies only successful results and leaves the rest untouched. A missing key short-circuits before any HTTP call. No key / network / timeout / 429 all degrade to "no change," not a broken page. *(Setting this decision to not block the pipeline on any single failure.)*

## Risks / Trade-offs

- [LLM changes meaning] → Prompt explicitly requires meaning preservation and verbatim passthrough when nothing improves; full confidence gate deferred to Phase 5.
- [Cost / rate limits] → Run only on explicit click; bounded batch; handle 429/timeout as no-op; no key ⇒ zero calls.
- [Text node detached before response (scroll/virtualization)] → Verify `isConnected` + not already marked before writing results.
- [Async apply during page changes] → Single apply pass after one batch; Phase 4 adds MutationObserver re-detection — an open follow-up, not this phase.
- [API key exposure] → Stored only in local storage; options page over HTTPS; key never logged or included in DOM.

## Migration Plan

The `[text-polisher] ` placeholder transform is removed from `content.ts`; the flow becomes detection → collect → `transform-text` → apply. `data-text-polished` marking is retained for idempotency. Deployment is via the normal build/load-add-on cycle (no data migration).

## Open Questions

None blocking. Batch size and exact prompt wording are tunable constants that don't change specs or the approach.
