# Web Polisher

A **Firefox extension** that transforms user-generated English text (comments, posts) into more natural, native-sounding language *on demand*.

You browse as normal; when you want a page's content polished, you click the toolbar button and it transforms the text in place — nothing else is touched. Because polishing runs only when you ask, it never wastes LLM API budget on pages whose text is already fine.

> **Product model:** on-demand / click-to-apply. This deliberately replaces an earlier "always-on, invisible, zero-interaction" idea: auto-transforming every page is wasteful (cost, unwanted edits) with a cloud-sourced LLM. Once you trigger polishing on a page, it proceeds with no further interaction.

## Status

**Phase 1 — Foundation & Safe Text Replacement: complete.** The extension builds and loads in Firefox (MV3), replaces text via `TreeWalker` without breaking React/Reddit/Facebook, and applies only when you click the action button.

**Phase 2 — Content Detection & Site Support: complete.** On trigger, the extension detects real user content (comments/posts) and excludes UI, nav, ads, buttons, and hidden/screen-reader text — verified on Reddit.

**Phase 3 — LLM Transformation Engine: complete.** The placeholder prefix is gone; text is rewritten for naturalness by the selected LLM, routed through the background worker. Supports OpenAI-compatible, Anthropic-compatible, and Gemini-compatible providers.

**Phase 5 — Quality & Confidence: complete.** A deterministic quality gate (token-overlap similarity + length fidelity) rejects low-confidence rewrites before they touch the page; the threshold is tunable in the options page.

**Phase 4 — Performance & Lazy Loading: complete.** After a click, content in/near the viewport is transformed first; off-screen and dynamically mounted content is processed as it scrolls into view, work pauses during scrolling, and a bounded LRU result cache avoids re-transforming the same text.

- ✅ Loads in Firefox without errors
- ✅ React-safe text replacement (no DOM breakage on Facebook/Reddit)
- ✅ Click-to-apply toolbar button (nothing transformed by default)
- ✅ Content detection: polishes user content, leaves UI/buttons/ads untouched
- ✅ Works across shadow DOM (Reddit shreddit components) and unknown sites
- ✅ Real LLM transformation routed through the background worker (MV3 CORS)
- ✅ Quality gate: low-confidence rewrites never reach the page
- ✅ Settings: any provider (well-known or custom) + model + API key, with "Test connection", via an options page
- ✅ Feedback: "Polishing…" modal, changed text highlighted with original on hover
- ✅ Lazy, viewport-gated processing: in-view content first, rest on scroll
- ✅ Dynamic-content pickup (infinite scroll / virtualization) after the click
- ✅ Bounded LRU result cache (storage.local) — no re-transforming the same text

> **Breaking change:** configuration moved from the old Gemini-only key to a provider config (`llm:config`). Existing users re-enter their API key once in the new options page.

## Requirements

- **Node.js 18+** and **npm**
- **Firefox 113+** (Manifest V3)

## Getting started

```bash
npm install

# Dev mode: builds and launches Firefox with the extension loaded (hot reload)
npm run dev:firefox

# Production build for Firefox
npm run build:firefox

# Type-check
npm run compile

# Run unit tests (vitest + jsdom)
npm test
```

### Loading in Firefox (manual, production build)
```bash
npm run build:firefox
```
Then in Firefox: `about:debugging` → **This Firefox** → **Load Temporary Add-on** → select `manifest.json` from `.output/firefox-mv3/`.

### Using it
1. Open any page (e.g. a Reddit thread).
2. **Nothing happens by default** — the page is untouched.
3. Click the extension's toolbar button (**"Polish this page"**).
4. The page's user-generated text is transformed in place.

## What it does today

- A background service worker and content script skeleton with message passing (content ↔ background); all Gemini API traffic routes through the background (MV3 CORS).
- A **content-side apply step** (`utils/polish.ts`): walks each detected root's text nodes (`TreeWalker`), edits **text nodes only** — never whole elements — so React's fiber tree stays intact on sites like Facebook and Reddit.
- A **click-to-apply action button** that sends an `apply-polish` message from the background to the active tab.
- A **content detector** (`utils/contentDetector.ts` + `utils/domWalk.ts`) that, on trigger, collects top-most user-content roots (site-specific or heuristic) and skips UI, nav, ads, buttons, non-`<button>` interactive wrappers, and hidden/screen-reader text. It pierces shadow DOM, so it works with Reddit's `shreddit-*` custom elements.
- A **shadow-DOM-aware walker** (`utils/domWalk.ts`) for detection, replacement, and visibility filtering.
- An **LLM transformation engine** (`utils/llmClient.ts` + `utils/apiClient.ts` + `utils/polish.ts`): eligible text nodes are batched into a `transform-text` message to the background, which calls the configured provider and returns results that are applied back to the same text nodes. Supports **OpenAI-compatible, Anthropic-compatible, and Gemini-compatible** providers (Gemini via the SDK; OpenAI/Anthropic via fetch). Failures, timeouts, and no-config degrade gracefully with the original text kept.
- A **quality gate** (`utils/quality.ts`): each model reply is scored (Dice token-overlap + length ratio) and rejected when below the configured confidence threshold.
- A **bounded LRU result cache** (`utils/cache.ts`): polished results are stored per original text in `browser.storage.local` (~1000 entries, 7-day TTL) so re-scrolling or re-encountering text reuses the result instead of re-calling the LLM.
- A **lazy, viewport-gated pipeline** (`utils/pipeline.ts`): after a click, user-content roots in/near the viewport are batched immediately; the rest are observed with `IntersectionObserver` and processed as the user scrolls near them. A `MutationObserver` picks up content mounted after the click, and work pauses while the user is actively scrolling.
- A **provider registry** (`utils/providers.ts`): well-known providers are fetched from a remote index (models.dev, cached ~24h) with a bundled fallback; "Custom Provider" lets you set a name, base URL, and OpenAI/Anthropic/Gemini compatibility. Model dropdowns are populated from the provider (cached live-fetch, index, or bundled suggestions), falling back to a free-text model id.
- An **options page** (`entrypoints/options/`) to pick provider → model → API key, run a "Test connection" check, and set the confidence threshold; the single config is persisted in `browser.storage.local` (`llm:config`).
- **Feedback** (`entrypoints/content.ts`): a brief "Polishing…" modal on trigger; rewritten text is wrapped in a highlighted span with the original shown as a tooltip on hover.
- Per-navigation state kept in `browser.storage.session` to survive Firefox's content-script lifecycle.

## Project structure

```
entrypoints/
  background.ts        Background service worker (message handler, LLM client, action-button forwarding)
  content.ts           Content script (document_idle; applies polish on trigger, modal + highlight feedback)
  options/             Options page (provider → model → API key, test connection, confidence threshold)
utils/
  contentDetector.ts   Content detection: site registry, exclusions, content roots
  contentDetector.test.ts
  domWalk.ts           Shadow-DOM-aware traversal + visibility filtering
  domWalk.test.ts
  polish.ts            Content-side orchestration: detect → batch → transform-text → apply (owns PROCESSED_ATTR idempotency)
  polish.test.ts
  pipeline.ts          Lazy viewport-gated pipeline (IntersectionObserver, MutationObserver, scroll-pause)
  pipeline.test.ts
  cache.ts             Bounded LRU result cache over storage.local (TTL + cap)
  cache.test.ts
  llmClient.ts         Background LLM client: config read, provider dispatch, batching, timeout, taxonomy, cache
  llmClient.test.ts
  apiClient.ts         OpenAI/Anthropic-compatible fetch clients + response parsing
  apiClient.test.ts
  providers.ts         Well-known provider registry (index fetch + cache, bundled fallback, model lists)
  providers.test.ts
  optionsModel.ts      Options-page config building/validation (DOM-free, testable)
  optionsModel.test.ts
  quality.ts           Confidence score + length-fidelity gate for LLM output
  quality.test.ts
  settings.ts          Shared constants (storage keys, provider index, batch/timeout, cache, viewport)
  live.integration.test.ts  jsdom end-to-end of the full polish flow
e2e/                   Selenium/Playwright E2E harnesses (Firefox, Chrome, Reddit)
public/icon/           Toolbar/listing icons (16/32/48/128 PNG)
scripts/
  generate-icons.mjs   Regenerates public/icon/*.png (pure Node, no deps)
openspec/
  specs/               OpenSpec capability specs (8: text-replacement, user-actions, content-detection, transformation-engine, quality-and-confidence, settings, user-experience, performance)
  changes/archive/     Completed, archived changes
docs/research/         Researched findings (pitfalls, architecture, stack)
wxt.config.ts          WXT build config incl. Firefox MV3 manifest
```

## Stack

| Concern | Choice |
|---|---|
| Extension framework | [WXT](https://wxt.dev) 0.21 (Vite-based) |
| Platform | Firefox Manifest V3 |
| Language | TypeScript |
| DOM | Native APIs only (`TreeWalker` for text traversal; `MutationObserver`/`IntersectionObserver` planned for Phase 4) |
| Storage | `browser.storage.*` (local / session) |
| Testing | Vitest + jsdom |

## Roadmap (from `openspec/specs/`)

| Phase | Capability | Status |
|---|---|---|
| 1 | Foundation & Safe Text Replacement (`text-replacement`) | ✅ archived |
| 1 | Explicit apply button (`user-actions`) | ✅ archived |
| 2 | Content Detection & Site Support (`content-detection`) | ✅ archived |
| 3 | LLM Transformation Engine (`transformation-engine`) | ✅ archived |
| 3 | Settings: API key + confidence threshold (`settings`) | ✅ archived |
| 3 | User Experience: modal + highlight feedback (`user-experience`) | ✅ archived |
| 5 | Quality & Confidence (`quality-and-confidence`) | ✅ archived |
| 4 | Performance & Lazy Loading (`performance`) | ✅ archived |

## Known findings

- **Dynamic content:** Reddit virtualizes its feed; off-screen content is now transformed lazily as it scrolls into view, and content mounted after the click is picked up by `MutationObserver`. Very deep threads still cost one LLM batch per scrolled-into-view region.

## License

Not yet specified.
