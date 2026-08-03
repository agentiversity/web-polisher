## Context

Landing on the Phase 1 foundation already built in `phase-1-foundation` (WXT scaffold, background + content skeleton, `utils/textReplacer.ts`). See proposal.md - Why for the pivot to on-demand. Key existing constraints: MV3 (background is the only place that can make external calls), content scripts see the page DOM, the two talk via messages, and `activeTab` permission covers the action-button click as a user gesture (no extra permissions needed).

## Goals / Non-Goals

**Goals:**
- The extension does **nothing** until the user clicks the action button.
- A single click applies polishing to the active page.
- Remove the Phase-1 auto-apply placeholder-on-load behavior.

**Non-Goals:**
- No per-page enable/disable toggle or options UI (out of scope for this change).
- No state persistence of "which pages are polished" (out of scope).
- No LLM transformation yet (that is Phase 3) — the button triggers the same placeholder proof-of-mechanics.

## Decisions

**D1: Toolbar action button (`browser.action`) as the trigger.** A per-tab toolbar action is the standard MV3 "apply to this page" affordance (as the user noted, many extensions do this).
- Alternatives considered: context-menu item (less discoverable), inline page button (Pollutes pages, contradicts "no on-screen controls"), auto-detect (the thing we're moving away from).

**D2: Background forwards an "apply-polish" message to the active tab's content script.** `action.onClicked(tab)` gives the tab id; the background sends `{ type: 'apply-polish' }` via `browser.tabs.sendMessage` to that tab. The content script's `browser.runtime.onMessage` handler runs the replacer.
- The content script already matches `*://*/*`, so it is present in the tab.
- `activeTab` permission is granted by the click gesture, so no `tabs`/`host` permission expansion is needed.

**D3: Content script no longer auto-applies.** Remove the on-load placeholder run from `phase-1-foundation`; the replacer only runs in response to the `apply-polish` message. Keeps the cost-control guarantee in the spec: no work until requested.

**D4: Keep the existing message round-trip pattern.** The ping handshake stays; the new `apply-polish` message reuses the same messaging path that later carries LLM requests, reinforcing the D4 architecture from Phase 1.

## Risks / Trade-offs

- [User must remember to click] → Mitigation: the action button is always visible in the toolbar, discoverable; acceptable trade for cost control.
- [Active tab has no content script (e.g. on `about:` or restricted pages)] → Mitigation: `tabs.sendMessage` rejects; the background catches and logs instead of crashing.
- [Product direction reversal (the original "passive invisible" differentiator)] → Mitigation: intentional, user-directed; documented in proposal (BREAKING). The "silent after trigger" requirement preserves most of the invisible-reading benefit.

## Migration Plan

This change refactors the in-flight Phase 1 content script (removing the dev placeholder auto-apply). No migration needed for users — the extension is net-new and unreleased.

## Open Questions

None.
