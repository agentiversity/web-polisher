## Context

Today the toolbar action button is wired via `background.ts` `action.onClicked` → `apply-polish` message to the active tab. All LLM configuration (provider/model/key) lives on the options page (`entrypoints/options/`), which is only reachable through `about:addons`. The content script and the apply pipeline are stable and unchanged by this work.

WXT auto-registers a popup entrypoint (`entrypoints/popup/`) as the action's `default_popup` in the built manifest. Setting `default_popup` means `action.onClicked` no longer fires — the popup itself is the interaction surface.

## Goals / Non-Goals

**Goals:**
- The action button opens a compact popup with a prominent icon-only "Polish Page" trigger and inline provider/model/key configuration.
- Reuse the existing, tested config logic (`providers.ts`, `optionsModel.ts`, `settings.ts`, `llmClient.testConnection`) so behavior stays identical to the options page.
- Keep the content script and apply pipeline untouched.

**Non-Goals:**
- No confidence-threshold or "Test connection" controls in the popup (options page keeps them).
- No changes to content detection, the LLM client, the quality gate, or the lazy pipeline.
- No changes to how polishing is applied once triggered.

## Decisions

### 1. Popup entrypoint wires the action popup
`entrypoints/popup/index.html` + `index.ts` + `index.css`. WXT sets `action.default_popup` automatically; the manifest needs no manual change. The background `action.onClicked` handler is removed (it never fires once a default popup is set).

**Alternatives considered:** Keeping `onClicked` and drawing a custom popup with the Page Actions API — rejected, WebExtension `action` popups are the standard, zero-cost mechanism.

### 2. Popup Polish button triggers the existing flow
The icon-only button (extension icon, `title="Polish Page"`) queries the active tab and sends the existing `apply-polish` message, then closes the popup immediately (fire-and-forget; polishing continues in the tab). Content script and pipeline are untouched.

**Alternatives considered:** Waiting for the apply reply before closing — rejected; a slow LLM run would hold the popup open. The content script already reports status to the background and hides its own modal when done.

### 3. Shared config-form controller
The options page and the popup would otherwise duplicate provider/model/key wiring. Extract the shared logic into `utils/configForm.ts` — a `initConfigForm(form, handles, opts)` that loads the saved config, renders the provider dropdown, updates the model control (dropdown vs free-text), collects/validates via `buildConfig`, saves to `storage.local`, and supports clearing the key. It is parameterized over which controls exist (`ConfigFormHandles`) so the popup can omit threshold/test/refresh controls while the options page keeps them. Mirrors the existing injectable pattern (`initOptions(doc, storage)`), so it stays jsdom-testable.

**Alternatives considered:** A standalone duplicated popup wiring — rejected, drift between the two surfaces would desync config behavior; a full `optionsModel` rewrite — rejected, the current pure functions are already correct and tested.

### 4. Popup trigger with no config is a no-op
Per the settings spec, "no key means no transformation". The Polish button stays enabled; with no saved key it sends `apply-polish`, the content script short-circuits (existing `notConfigured` path), and no text changes. A status line in the popup surfaces save errors.

## Risks / Trade-offs

- **Popup size limits** → The config controls are compact (no threshold/test/refresh); the shared controller keeps only the three essential controls plus Save/Clear.
- **Drift between popup and options page** → Both surfaces share `utils/configForm.ts`, so the common controls stay in sync by construction.
- **`apply-polish` fires while the popup closes** → The message is fire-and-forget; if the active tab has no content script (e.g. `about:` pages) the existing catch logs and does nothing.
- **WXT popup auto-detection assumption** → Verified at build time; if it does not set `default_popup`, add it explicitly in `wxt.config.ts` `manifest.action`.

## Migration Plan

- Feature behavior change: the action button now opens the popup instead of polishing directly.
- Rollback: restore the `action.onClicked` handler in `background.ts` and drop the popup entrypoint.
