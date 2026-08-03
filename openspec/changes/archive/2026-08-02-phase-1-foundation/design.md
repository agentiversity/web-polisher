## Context

Goal: prove the extension can safely replace page text on framework-driven sites before any detection/LLM work. See proposal.md - Why. The existing constraints that shape this design:

- Firefox MV3; background service worker is non-persistent, so state must live in storage, not globals.
- Content scripts see the DOM via Firefox's Xray vision but the page's React/Vue still owns the real nodes — naive `textContent`/`innerHTML` replacement breaks their fiber tree (Pitfall #1).
- Baseline specs describe the full v1 target; this change implements only the foundation slice.

## Goals / Non-Goals

**Goals:**
- WXT-based Firefox MV3 scaffold that builds and loads cleanly.
- A text-node replacer (TreeWalker) that preserves element references, event listeners, and framework state.
- A content-script ↔ background message-passing stub proving the CORS-safe architecture.
- A spike validating TreeWalker on a real React page before the approach is locked in.

**Non-Goals:**
- No LLM calls (Phase 3), no content-detection heuristics or UI-exclusion (Phase 2), no lazy loading / IntersectionObserver (Phase 4), no confidence scoring (Phase 5).
- No actual "polishing" yet — Phase 1 replaces/marks text with a deterministic placeholder to validate the DOM mechanics.

## Decisions

**D1: WXT over raw Vite / Plasmo.** WXT provides file-based entrypoints, auto-manifest, HMR, and native `wxt -b firefox`. Chosen over manual Vite config (too much boilerplate) and Plasmo (heavier, commercial licensing). See research/STACK.md.
- Alternative considered: hand-rolled Vite + manual manifest.

**D2: Replace text nodes only via TreeWalker, never whole elements.** Walk `NodeFilter.SHOW_TEXT` and mutate only text nodes. This preserves element references and lets React's fiber tree keep pointing at valid nodes.
- Alternative considered: clone-then-replaceWith — rejected, still breaks framework state (Pitfall #1).

**D3: Keep a reference to original text for restore/debug using WeakRefs + an in-DOM marker.** Store the original text weakly (so removed nodes can be GC'd) and mark processed nodes with a `data-polished`-style attribute to prevent duplicate replacement. Never store whole element references long-term (Pitfall #7).
- Alternative considered: storing full HTML in `innerHTML` — rejected (destroys listeners/fiber state).

**D4: Background service worker as event page + content script at `document_idle`, with a stub message round-trip.** `browser.runtime.onMessage` in the background and a content-script call that sends a `{ type: 'ping' }`-style message and logs the reply. This validates the message-passing path before any LLM work, confirming the CORS-routing architecture is sound (Pitfall #4).

**D5: Persist any in-memory state in `browser.storage.session`, not global vars.** Firefox keeps content scripts alive across same-tab navigation but drops `window` properties (Pitfall #11, bug 1525400). Module-scoped state + `pageshow`/`pagehide` listeners keep it correct.

**D6: Scope the spike as an explicit Phase 1 task.** TreeWalker correctness on React is uncertain; verify on a real Facebook/Reddit page before committing (research flag for Phase 1).

## Risks / Trade-offs

- [React/Vue fiber breakage (Pitfall #1)] → Mitigation: text-node-only replacement + mandatory spike (D6); remaining risk is low-edit-area coverage, to be observed during the spike.
- [Firefox content-script lifecycle across navigation (Pitfall #11)] → Mitigation: `browser.storage.session` + `pageshow`/`pagehide` (D5).
- [Duplicate replacement of the same node (Pitfall #10)] → Mitigation: in-DOM processed marker + WeakRef original-text store (D3).
- [CORS wall for future LLM calls (Pitfall #4)] → Mitigation: background-routed message-passing skeleton established now (D4), even though no API calls happen in this phase.

## Migration Plan

Greenfield — no existing code to migrate. Rollback is trivial (disable the extension; nothing persists outside `storage`).

## Open Questions

- Exact content-script match scope for v1 (`*://*/*` vs site-specific). Chosen `*://*/*` to satisfy SITE-01/generic support and the baseline spec; site optimization lands in Phase 2. Not blocking — it is configuration, not behavior.
