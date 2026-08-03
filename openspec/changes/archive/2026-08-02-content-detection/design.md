## Context

Landing on the Phase 1 foundation: a content script (`entrypoints/content.ts`) that applies a `Text`-walker placeholder transform on a click-to-apply trigger, with a basic `isUiElement` guard in `utils/textReplacer.ts`. See proposal.md - Why. Real testing on Reddit showed the guard misses non-`<button>` interactive wrappers. Phase 2 replaces the stopgap with a proper detector while keeping the same click-gated flow.

## Goals / Non-Goals

**Goals:**
- Reliably mark user-generated content (comments/posts) as transformable.
- Reliably exclude UI/nav/ads/labels from transformation, including non-native interactive wrappers.
- Support known sites (Facebook, Reddit) via selectors and unknown sites via heuristics, without code changes per new site.
- Only detected user content is touched in the apply flow.

**Non-Goals:**
- Dynamic-content lazy loading / `MutationObserver` (DET-03) — Phase 4.
- LLM transformation (Phase 3).
- Auto-apply — the action button remains the trigger.
- Generalizing beyond English or beyond the current browser scope.

## Decisions

**D1: Two-stage detector = "positive match OR heuristic", gated by "negative match".** A node is user content if it matches a positive signal (known comment/post selector, `role="article"`, etc.) or passes a heuristic (length, low interactivity, not inside an excluded region), **and** matches no negative/exclusion signal first. Exclusion wins. This mirrors the current `isUiElement` guard but generalizes it and adds positive detection.
- Alternatives considered: pure selector list (breaks on unknown sites), pure ML (overkill now).

**D2: Data-driven per-site selector registry.** A small config module maps hostnames → `{ contentSelectors, excludeSelectors }`. New sites are added by editing the registry (data), not the detection logic. Unknown sites use generic heuristics.
- Replaces hardcoded site logic; keeps Phase 1's "adapt without site-specific code" (SITE-02).

**D3: Exclusion checks ancestors and non-tag interactive signals.** The previous guard only checked the direct parent tag/role and missed `div`/`span` buttons. The new detector checks the element **and its interactive ancestors**, plus a non-tag heuristic: interactive-looking text (short, action-oriented) inside clickable wrappers is excluded. Known-site exclude selectors (e.g. Reddit's widget classes) are added to the registry to catch the specific wrappers seen in the Reddit test.

**D4: Detection runs inside the existing `apply-polish` handler** — before replacement, compute the set of user-content root nodes; the replacer then only walks within those roots. Keeps the replacer DOM-safe and the button flow unchanged.

## Risks / Trade-offs

- [Over/under-detection on unknown sites] → Mitigation: conservative heuristics; if detection is uncertain, lean to the exclusion side (bad polish is worse than none, per the product's quality principle).
- [Selectors drift when Facebook/Reddit change DOM] → Mitigation: registry is data, easy to update; heuristics provide a fallback so the extension keeps working (less accurately) between selector updates.
- [Performance on huge DOMs] → Mitigation: detection is a one-time walk over the page at apply time (Phase 4 adds lazy-loading to avoid doing this per-scroll).

## Migration Plan

Replace the `isUiElement` headless guard path with the detector while keeping `isUiElement`/replacement API intact where possible. No user-facing migration (unreleased extension).

## Open Questions

None — remaining unknowns (exact Facebook/Reddit selectors) are resolvable during implementation/th testing and do not change the spec.
