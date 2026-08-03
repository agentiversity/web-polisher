## 1. Spike: verify TreeWalker on a React page

- [x] 1.1 Stand up a minimal WXT scaffold and load it in Firefox against a real Facebook/Reddit page — validated on host via `wxt -b firefox` on Reddit
- [x] 1.2 Prototype TreeWalker text-node replacement and confirm the React fiber tree is not broken (no disappear/duplicate/flicker, UI stays responsive) — verified on host: no obvious breakage
- [x] 1.3 Record findings and decide whether text-node replacement is viable or a pivot is needed (see design D6) — VIABLE. Reddit applied 34 text nodes, no React breakage; known gaps (dynamic posts, button wrappers) map to Phases 4 and 2

## 2. WXT project scaffold

- [x] 2.1 Initialize the WXT project with the TypeScript template (package.json, wxt.config.ts, tsconfig.json, entrypoints/ created manually)
- [x] 2.2 Configure Firefox MV3: `browser_specific_settings.gecko.id` + `strict_min_version` and target Firefox (builds as firefox-mv3; verified in generated manifest)
- [x] 2.3 Declare permissions (`storage`, `activeTab`) and `*://*/*` host/content-script matches (verified in generated manifest)
- [x] 2.4 Verify the extension builds and loads in Firefox without errors — build verified (firefox-mv3, typecheck clean); live load verified on host: background loaded + content script registered, no errors (only harmless WXT dev-mode CSP warnings ~ dev-only)

## 3. Safe text replacement

- [x] 3.1 Implement the TreeWalker text-node replacer module (text nodes only — see design D2) — utils/textReplacer.ts + 7 passing unit tests
- [x] 3.2 Preserve original text for restore/debug via WeakRefs + an in-DOM processed marker (design D3) — WeakMap of originals + `data-text-polished` marker
- [x] 3.3 Wire the replacer into the content script (entrypoints/content.ts); application is trigger-gated — auto-apply on load was removed and replaced by the action-button trigger (handled in the `explicit-apply-button` change)
- [x] 3.4 Confirm clicking, scrolling, and navigation stay intact on a test page after replacement — verified on host (Reddit): page intact, scrolling smooth, navigation works

## 4. Content script + background service worker skeleton

- [x] 4.1 Create the background service worker entrypoint with a `runtime.onMessage` handler stub (design D4) — entrypoints/background.ts (firefox-mv3 `background` in generated manifest)
- [x] 4.2 Create the content script entrypoint running at `document_idle` (verified in generated manifest)
- [x] 4.3 Wire a stub message round-trip (content → background → content) to validate the CORS-safe architecture
- [x] 4.4 Keep state in `browser.storage.session` and reset on `pageshow`/`pagehide` for Firefox navigation correctness (design D5)
