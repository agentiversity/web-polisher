## 1. Shared config-form controller

- [x] 1.1 Create `utils/configForm.ts`: extract provider/model/key wiring from `options/index.ts` into an injectable `initConfigForm(form, handles, opts)` (loads saved config, renders providers, updates model dropdown vs free-text, collects/validates via `buildConfig`, saves/clears in `storage.local`), parameterized over which controls exist so the popup can omit threshold/test/refresh
- [x] 1.2 Refactor `entrypoints/options/index.ts` to use the shared controller, keeping options-only controls (confidence threshold, Test connection, refresh buttons) in the options page
- [x] 1.3 Add unit tests for `configForm.ts` (jsdom): load saved values, provider rendering (custom first), model dropdown vs free-text, collect/validate/save/clear

## 2. Popup entrypoint

- [x] 2.1 Create `entrypoints/popup/index.html`: large central icon-only "Polish Page" button (extension icon, `title="Polish Page"`) at the top, then provider/model/API-key controls with Save/Clear and a status line
- [x] 2.2 Create `entrypoints/popup/index.css` with compact popup styling
- [x] 2.3 Create `entrypoints/popup/index.ts` with an injectable `initPopup(doc, storage)`: wires the shared config form and the Polish button (query active tab → send `apply-polish` → close popup)
- [x] 2.4 Add jsdom tests for `initPopup`: Polish button sends `apply-polish` to the active tab and closes the popup; controls reflect/save configuration; Polish click with no saved key still sends the message (content script no-ops)

## 3. Background & manifest

- [x] 3.1 Remove the `action.onClicked` listener from `background.ts` (no longer fires once a default popup is set)
- [x] 3.2 Verify the built manifest sets `action.default_popup`; if WXT does not auto-wire the popup, set it explicitly in `wxt.config.ts`

## 4. Verification

- [x] 4.1 `npm run compile` and `npm test` green
- [x] 4.2 `npm run build:firefox` clean; confirm `popup.html` is emitted and the manifest has `default_popup`
- [x] 4.3 (Manual, host) Load the add-on: click the action button → popup opens; hovering the top button shows the "Polish Page" tooltip; clicking it polishes the active page; changing the model in the popup is reflected on subsequent polishes
