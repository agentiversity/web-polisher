## Why

The toolbar action button currently polishes a page instantly on a single click. The user gets no chance to check the page, switch provider/model, or fix the API key before a (potentially costly) LLM run — and an accidental click triggers it immediately. Configuration lives only in the options page, which is buried under `about:addons`. The extension needs the trigger and the essential configuration in one glanceable, deliberate surface.

## What Changes

- The toolbar action button now **opens a popup panel** instead of applying polish directly.
- At the top of the popup is a **large, central, icon-only "Polish Page" button** (no text; a native tooltip shows "Polish Page").
- Below the button, the popup shows the **provider, model, and API key configuration controls** (same logic as the options page), so the user can switch provider/model or enter a key right before polishing.
- Clicking "Polish Page" sends the existing `apply-polish` message to the active tab and closes the popup. The background/content pipeline is unchanged.

## Capabilities

### New Capabilities
- `action-popup`: The toolbar popup UI — a prominent icon-only polish trigger and inline provider/model/API-key configuration.

### Modified Capabilities
- `user-actions`: The action button no longer applies polish on click; it opens the popup, and the popup's "Polish Page" button is the explicit trigger. Default no-op and silent-after-trigger behavior are unchanged.
- `settings`: Configuration can be set and removed from the action popup in addition to the options page.

## Impact

- New WXT popup entrypoint: `entrypoints/popup/` (index.html, index.ts, index.css) plus jsdom tests.
- Manifest `action` gains `default_popup`; the background `action.onClicked` handler is replaced by the popup's own trigger logic.
- Reuses existing, unchanged logic: `utils/providers.ts`, `utils/optionsModel.ts`, `utils/settings.ts`, and `testConnection` from `utils/llmClient.ts`.
- Content script and the apply pipeline are unchanged (they still respond to `apply-polish`).
