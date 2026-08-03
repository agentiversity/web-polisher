## Why

Auto-transforming text on every page wastes cloud-LLM budget on content that is already natural (and risks silently altering text the user didn't ask to change). The polisher should run **on demand**: the user clicks the extension's action button to explicitly apply polishing to the current page; otherwise nothing is transformed (and no LLM calls are made).

This reverses the original "always-on, zero-interaction" positioning. The motivation is cost-correctness and user intent: spend LLM budget only where the user asks for it.

## What Changes

- The extension is **off by default**: no page content is transformed and no LLM calls are made until the user acts.
- A **toolbar action button** applies text polishing to the **active page** when clicked.
- After the user triggers it, transformation proceeds with no further per-item interaction (silent on the page).

**BREAKING (product direction):** The previous "passive, invisible, no-interaction" model is replaced by an explicit click-to-apply model.

## Capabilities

### New Capabilities
- `user-actions`: The extension's toolbar action button lets the user explicitly apply text polishing to the active page; nothing is transformed by default.

### Modified Capabilities
- `user-experience`: Replaces "transform silently without UI triggers / always-on invisible operation" with the explicit-trigger model — the polisher only runs after the user clicks the action button, then remains invisible on the page.
- `transformation-engine`: Reframes "operate passively (no interaction)" to "no further per-item interaction once the user has enabled polishing for a page."

## Impact

- Manifest: add the toolbar `action` entry point (button).
- Background service worker: handle `action.onClicked` and forward an apply message to the active tab's content script.
- Content script: stop auto-applying on load; respond to an "apply polish" message by running the replacer.
- No new permissions required (existing `activeTab` covers the action-button user gesture).
- Phase 1 code is where this lands: the content script and background skeleton built in `phase-1-foundation`.
