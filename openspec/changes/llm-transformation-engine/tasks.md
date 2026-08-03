## 1. Setup

- [ ] 1.1 Add `@google/generative-ai` to `package.json` dependencies
- [ ] 1.2 Register the options page in `wxt.config.ts` (and verify it builds)

## 2. Options page & key storage (`settings`)

- [ ] 2.1 Create `entrypoints/options/` (index.html + index.ts) with a form to set/clear the Gemini API key
- [ ] 2.2 Persist the key in `browser.storage.local`; load it into the form on open; clear removes it
- [ ] 2.3 Add the options page to the manifest / action context menu so it's reachable in Firefox

## 3. Background LLM client

- [ ] 3.1 Create `utils/llmClient.ts` (background-side) that reads the API key from `browser.storage.local` and constructs a Gemini client
- [ ] 3.2 Implement a batched `transform(texts: string[]) => Promise<{ text; ok }[]>` function with a meaning-preservation prompt; returns the original verbatim when nothing improves
- [ ] 3.3 Handle errors gracefully: missing key (no call), network/timeout, rate-limit — each returns `ok:false` per item, never throws uncaught

## 4. Background message handler

- [ ] 4.1 Handle a `transform-text` message in `background.ts`: read the key, run the batched transform, reply with per-item results
- [ ] 4.2 Return a clear "not configured" reply when no API key is set (content script then does nothing)

## 5. Content-side orchestration

- [ ] 5.1 Create `utils/polish.ts`: run existing detection → collect eligible text nodes under the roots (visible, non-UI, above minLength)
- [ ] 5.2 Send the collected texts via `transform-text`, then apply each successful result back to the **same** text node (verify `isConnected` and unmarked before writing; keep original on failure/no-op)
- [ ] 5.3 Retain `data-text-polished` idempotency marking across the apply pass

## 6. Wire into the apply flow

- [ ] 6.1 In `content.ts`, replace the `[text-polisher] …` placeholder transform with the `polish.ts` LLM path
- [ ] 6.2 Keep the click-to-apply trigger and message round-trip unchanged; a click with no key is a graceful no-op

## 7. Tests & build

- [ ] 7.1 Unit tests: `llmClient` batching/failure/not-configured logic; `polish.ts` collect/apply/idempotency (mock the messaging/LLM)
- [ ] 7.2 Type-check (`npm run compile`) and full test suite green
- [ ] 7.3 Firefox build clean (`npm run build:firefox`)
- [ ] 7.4 (Manual, host) Load add-on, set a key, click on a Reddit thread; verify comments are rewritten naturally, buttons/nav untouched, and re-clicking doesn't double-transform; clear key and confirm a no-op click
