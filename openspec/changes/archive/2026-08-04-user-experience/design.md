## Context

Retro-adoption of the `user-experience` capability: the spec was already written into the main specs and the behavior already implemented and E2E-verified (Chrome + real Firefox harnesses). This document records the design decisions as they exist in the code, so the change has a faithful `design.md` rather than a speculative one.

Implementation today: the trigger (`user-actions`) sends `apply-polish` → the content script (`entrypoints/content.ts`) shows a fixed-position "Polishing…" modal while the lazy pipeline (`utils/pipeline.ts` → `utils/polish.ts`) runs, then hides it. Each applied rewrite wraps the text node in a `<span class="text-polished">` whose `title` attribute carries the original (native tooltip on hover). No per-item or error UI exists.

## Goals / Non-Goals

**Goals:**
- Record the implemented feedback design: one brief indicator on trigger, then quiet; changed text highlighted with the original available on hover.
- Confirm the explicit-trigger contract: nothing transforms and no indicator shows until the user clicks the action button.
- Confirm silent-on-failure: a failed/rejected transformation leaves the original text and surfaces no error.

**Non-Goals:**
- Changing any runtime behavior.
- Adding per-item confirmations, error toasts, settings for the indicator, or animation polish.

## Decisions

**D1 — One modal, shown on trigger, hidden when the initial pass settles.**
`showPolishingModal()`/`hidePolishingModal()` (`entrypoints/content.ts`) render a single fixed overlay (dark translucent, spinner + "Polishing…") on `apply-polish`, removed in a `finally` after `startPolish` resolves. Since Phase 4, the modal covers the *initial viewport pass*; scroll-driven work continues silently. Rationale: give immediate feedback that the click registered, then get out of the way (per the "brief indicator, then remain quiet" requirement).

**D2 — Highlight each rewrite in place, original as a tooltip.**
`utils/polish.ts` replaces only the affected text node with a `<span class="text-polished">` (light-blue `#cfe4f7`, rounded) and sets `span.title = original`. Native tooltip on hover lets the user compare without a side-by-side UI. This stays React-safe (text-node-level write, never whole-element replacement) and is skipped when the rewrite is not meaningfully different (`isMeaningfullyChanged`).

**D3 — Silent on failure.**
All failure paths keep the original text (`polishRoot` returns `applied:0`, content keeps the node). No error surface is presented to the user; the modal is the only feedback and it always clears. Rationale: a failed polish is never worse than leaving the page alone, and error UIs would violate "remain quiet while text updates".

**D4 — No indication before the trigger.**
The modal and observers exist only after `apply-polish`; on page load the content script does nothing visible.

## Risks / Trade-offs

- **One modal hides before the long tail finishes** → intended (silent scroll-driven processing); the highlight span remains the persistent "what changed" signal.
- **Tooltip is browser-native, not styled** → acceptable; zero dependency, consistent across pages.
- **Highlight styling is hard-coded in JS** (`utils/polish.ts`) rather than a content-script stylesheet → kept minimal; revisit if theming is ever requested.

## Migration Plan

None. No runtime change; no data.

## Open Questions

None.
