## 1. Action button in manifest

- [x] 1.1 Add the toolbar `action` entry point to the manifest (default title like "Polish this page")
- [x] 1.2 Verify the generated manifest includes `action` when built for Firefox (confirmed: `action: {default_title: 'Polish this page'}`)

## 2. Background worker — forward clicks to the active tab

- [x] 2.1 Handle `browser.action.onClicked` and forward an `apply-polish` message to the active tab's content script (design D2)
- [x] 2.2 Handle the case where the active tab has no content script (log instead of crash)

## 3. Content script — trigger-gated application

- [x] 3.1 Remove the on-load auto-apply of the placeholder transform (design D3; was phase-1-foundation task 3.3)
- [x] 3.2 Add a `browser.runtime.onMessage` handler for `apply-polish` that runs the replacer on the page
- [x] 3.3 Return a confirmation (e.g. count of text nodes replaced) to the background
- [x] 3.4 Keep the existing ping round-trip and storage.session / pageshow-pagehide lifecycle handling

## 4. Verification

- [x] 4.1 Build for Firefox and typecheck cleanly
- [x] 4.2 Unit tests still pass (replacer unchanged)
- [x] 4.3 (Manual, on host) Clicking the action button applies polishing to the active page; no transformation occurs before the click — verified on Reddit: nothing before click, applied to 34 text nodes after
