# Web Polisher

A **Firefox extension** that transforms user-generated English text (comments, posts) into more natural, native-sounding language *on demand*.

You browse as normal; when you want a page's content polished, you click the toolbar button and it transforms the text in place — nothing else is touched. Because polishing runs only when you ask, it never wastes LLM API budget on pages whose text is already fine.

> **Product model:** on-demand / click-to-apply. This deliberately replaces an earlier "always-on, invisible, zero-interaction" idea: auto-transforming every page is wasteful (cost, unwanted edits) with a cloud-sourced LLM. Once you trigger polishing on a page, it proceeds with no further interaction.

## Status

**Phase 1 — Foundation & Safe Text Replacement: complete.** The extension builds and loads in Firefox (MV3), replaces text via `TreeWalker` without breaking React/Reddit/Facebook, and applies only when you click the action button.

**Phase 2 — Content Detection & Site Support: complete.** On trigger, the extension detects real user content (comments/posts) and excludes UI, nav, ads, buttons, and hidden/screen-reader text — verified on Reddit.

- ✅ Loads in Firefox without errors
- ✅ React-safe text replacement (no DOM breakage on Facebook/Reddit)
- ✅ Click-to-apply toolbar button (nothing transformed by default)
- ✅ Content detection: polishes user content, leaves UI/buttons/ads untouched
- ✅ Works across shadow DOM (Reddit shreddit components) and unknown sites
- ⏳ Phases 3–5 (LLM transformation, performance, quality) are spec'd but not yet built

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

## What it does today (Phases 1–2)

- A background service worker and content script skeleton with message passing (content ↔ background), the architecture that later carries LLM requests.
- A **React/Vue-safe text replacer** (`utils/textReplacer.ts`) that walks the DOM with `TreeWalker`, editing **text nodes only** — never whole elements — so React's fiber tree stays intact on sites like Facebook and Reddit.
- A **click-to-apply action button** that sends an `apply-polish` message from the background to the active tab.
- A **content detector** (`utils/contentDetector.ts` + `utils/domWalk.ts`) that, on trigger, collects top-most user-content roots (site-specific or heuristic) and skips UI, nav, ads, buttons, non-`<button>` interactive wrappers, and hidden/screen-reader text. It pierces shadow DOM, so it works with Reddit's `shreddit-*` custom elements.
- A **shadow-DOM-aware walker** (`utils/domWalk.ts`) for detection, replacement, and visibility filtering.
- Per-navigation state kept in `browser.storage.session` to survive Firefox's content-script lifecycle.

> **Note:** the current "transformation" is a deterministic `[text-polisher] …` placeholder (prefix) used to prove the DOM mechanics. Real LLM transformation arrives in **Phase 3**.

## Project structure

```
entrypoints/
  background.ts        Background service worker (message handler, action-button forwarding)
  content.ts           Content script (document_idle; applies polish on trigger)
utils/
  contentDetector.ts   Content detection: site registry, exclusions, content roots
  contentDetector.test.ts
  domWalk.ts           Shadow-DOM-aware traversal + visibility filtering
  textReplacer.ts      TreeWalker text-node replacement + UI-element exclusion guard
  textReplacer.test.ts Unit tests
openspec/
  specs/               OpenSpec capability specs (7: text-replacement, user-actions, content-detection, ...)
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
| DOM | Native APIs only (`TreeWalker`, `MutationObserver`, `IntersectionObserver`) |
| Storage | `browser.storage.*` (local / session) |
| Testing | Vitest + jsdom |

## Roadmap (from `openspec/specs/`)

| Phase | Capability | Status |
|---|---|---|
| 1 | Foundation & Safe Text Replacement (`text-replacement`) | ✅ archived |
| 1 | Explicit apply button (`user-actions`) | ✅ archived |
| 2 | Content Detection & Site Support (`content-detection`) | ✅ archived |
| 3 | LLM Transformation Engine (`transformation-engine`) | ⏳ not started |
| 4 | Performance & Lazy Loading (`performance`) | ⏳ not started |
| 5 | Quality & Confidence (`quality-and-confidence`) | ⏳ not started |

## Known findings (to address in later phases)

- **Dynamic content:** Reddit virtualizes its feed, so only posts in the DOM at click time get transformed. Handling infinite scroll / newly-mounted content is **Phase 4**.
- **Real transformation:** the current `[text-polisher] …` prefix is a placeholder; actual LLM natural-language transformation is **Phase 3**.

## License

Not yet specified.
