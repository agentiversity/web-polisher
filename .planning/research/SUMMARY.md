# Project Research Summary

**Project:** Text Polisher Extension (Firefox)
**Domain:** Browser extension — passive reading transformation (not writing assistance)
**Researched:** 2026-07-26
**Confidence:** HIGH

## Executive Summary

This is a **blue-ocean Firefox extension** that passively transforms user-generated English text (comments, posts) into more natural-sounding English as the user reads — no clicks, no popups, no interaction. No direct competitor exists: Grammarly/Wordtune/LanguageTool are all *writing* assistants requiring user action. This tool transforms what users *read*.

**Recommended approach:** Firefox MV3 via WXT (Vite-based, MIT, simpler than Plasmo). Gemini Flash as cloud LLM (cheapest viable: $0.075/1M input, sub-2s latency, free tier 15 RPM). WebLLM deferred to v2 for privacy/local execution. Content script does DOM detection + replacement; background service worker handles all LLM API calls (content scripts can't make cross-origin fetches in MV3 — CORS hard block).

**Key risks:**
1. **React/Vue DOM breakage** — Facebook/Reddit use React. Naive `textContent` replacement breaks fiber tree, causes UI glitches. Must use TreeWalker on text nodes only.
2. **Polishing UI elements** — buttons, nav, ads must be excluded. Site-specific selectors + whitelist approach required.
3. **Confidence threshold** — cheap LLMs mangle slang/idioms. Must abort bad transformations or users uninstall.

## Key Findings

### Recommended Stack

- **WXT 0.20.27** — extension build framework. Vite-based, file-based entrypoints, auto-manifest, HMR, native Firefox support. Beats Plasmo (simpler, MIT, no licensing concerns).
- **TypeScript 5.x** — type safety for DOM manipulation + LLM calls. WXT default.
- **Gemini Flash** — cloud LLM. 2x cheaper than GPT-4o-mini, faster, free tier sufficient for MVP.
- **Native DOM APIs** — TreeWalker, MutationObserver, IntersectionObserver. No libraries needed.
- **`browser.storage.local`** — settings, API keys, LRU cache. 5MB limit sufficient.
- **web-ext** — official Mozilla CLI for run/build/lint.
- **pnpm** — package manager (WXT docs standard).

Deferred: WebLLM (v2), React for UI (vanilla HTML/CSS sufficient for options page).

### Expected Features

**Must have (table stakes):**
- Reliable content detection (user content vs UI/nav/ads) — core technical challenge
- Passive operation (zero interaction) — the differentiator
- Natural transformation (not just grammar) — value prop
- Confidence threshold (abort bad transforms) — trust gate
- Graceful latency handling (1-2s delay OK if managed)
- Site-specific support (Facebook, Reddit first)

**Should have (competitive):**
- Lazy loading (IntersectionObserver) — performance on infinite scroll
- Selective transformation — only user-generated content
- Progressive enhancement — show original while loading
- Small/cheap LLM support — cost-effective

**Defer (v2+):**
- Local LLM execution (WebLLM) — privacy feature, adds complexity
- Generic site support — nail FB/Reddit first
- Advanced settings — auto-only for v1
- Transformation history/undo — YAGNI
- Non-English languages — scope explosion

### Architecture Approach

MV3 extension with three-layer split: **manifest** → **background service worker** (LLM calls, caching, confidence logic) → **content script** (DOM detection, lazy loading, text replacement). Content script ↔ background communicate via message passing (ports for streaming). All API calls route through background — content scripts hit CORS wall on cross-origin fetches.

**Major components:**
1. **Content Detector** — site-specific selectors + heuristic fallback to identify user-generated content
2. **Lazy Load Observer** — IntersectionObserver, 200px rootMargin, process only viewport-proximate content
3. **DOM Replacer** — TreeWalker-based text node replacement preserving element references
4. **Background LLM Client** — Gemini API calls, hash-based cache, confidence scoring
5. **Options Page** — vanilla HTML/CSS for API key input, enable/disable

### Critical Pitfalls

1. **React/Vue DOM breakage** (#1) — Never replace entire elements. TreeWalker on text nodes only. Test on FB/Reddit in Phase 1.
2. **LLM latency → scroll jank** (#2) — IntersectionObserver mandatory. Max 2-3 concurrent API calls. Cache aggressively. Abort on scroll-away.
3. **Polishing UI elements** (#3) — Whitelist approach: site-specific selectors for user content, exclude `<button>`, `<a>`, `role="button"`, etc.
4. **CORS block on content script** (#4) — All LLM API calls must route through background service worker. Non-negotiable.
5. **Confidence threshold too loose** (#5) — Semantic similarity check + length check + tone-preservation prompt. Start conservative.

## Implications for Roadmap

### Phase 1: Foundation + Safe Text Replacement
**Rationale:** Must prove DOM manipulation works on React sites before building anything else. Pitfall #1 is showstopper — if text replacement breaks FB/Reddit, nothing else matters.
**Delivers:** WXT project scaffold, manifest.json, empty background + content scripts, TreeWalker-based text replacer that preserves React fiber state.
**Addresses:** Passive operation (proof of concept)
**Avoids:** Pitfall #1 (React/Vue breakage), Pitfall #11 (Firefox navigation lifecycle)
**Research flag:** Needs spike — verify TreeWalker approach on actual Facebook/React DOM before committing.

### Phase 2: Content Detection
**Rationale:** Can't polish everything — must distinguish user content from UI. Pitfall #3 (polishing buttons/nav) causes immediate uninstall.
**Delivers:** Site-specific selectors for Facebook + Reddit, heuristic fallback for generic sites, exclusion rules for UI elements.
**Addresses:** Reliable content detection, selective transformation
**Avoids:** Pitfall #3 (UI element polishing)
**Research flag:** Standard patterns — well-documented DOM selectors, no deep research needed.

### Phase 3: LLM Integration
**Rationale:** Core transformation engine. Must route through background (CORS), handle API keys securely, implement basic polish prompt.
**Delivers:** Background service worker with Gemini Flash client, message passing (content → background → content), user-provided API key in settings, hash-based cache.
**Uses:** Gemini Flash, `@google/generative-ai` SDK, `browser.storage.local`
**Implements:** Background LLM Client component
**Avoids:** Pitfall #4 (CORS), Pitfall #8 (API key exposure)
**Research flag:** Standard patterns — Gemini API well-documented, message passing is MV3 boilerplate.

### Phase 4: Lazy Loading + Performance
**Rationale:** Without lazy loading, extension kills scroll performance on long threads. Pitfall #2 makes product unusable.
**Delivers:** IntersectionObserver (200px rootMargin), concurrent request limiting (max 2-3), debounce scroll events, `data-polished` marking to prevent duplicate polishing.
**Addresses:** Lazy loading, graceful latency handling, performance
**Avoids:** Pitfall #2 (scroll jank), Pitfall #10 (duplicate polishing)
**Research flag:** Standard patterns — IntersectionObserver well-documented.

### Phase 5: Confidence Threshold + Quality Tuning
**Rationale:** Cheap LLMs mangle slang/idioms. Without quality gate, users see worse text and uninstall.
**Delivers:** Semantic similarity check (original vs polished), length check (±20%), tone-preservation prompt, conservative default threshold with tuning path.
**Addresses:** Confidence threshold, natural transformation quality
**Avoids:** Pitfall #5 (loose threshold)
**Research flag:** Needs research — confidence heuristics need experimentation. What similarity threshold? How to detect tone shift? Prompt engineering for naturalness vs correctness.

### Phase 6: Cache Management + Error Handling
**Rationale:** Memory leaks from unbounded cache, offline handling, race conditions with virtual scrolling.
**Delivers:** LRU cache (1000 entries max, 7-day TTL), offline detection (fail silently), WeakRef for DOM references, text verification before update.
**Addresses:** Performance at scale, reliability
**Avoids:** Pitfall #6 (memory leaks), Pitfall #7 (race conditions), Pitfall #9 (offline)
**Research flag:** Standard patterns — LRU cache, WeakRef well-documented.

### Phase Ordering Rationale

- **Phase 1 first** because DOM breakage is existential — if TreeWalker doesn't work on React, pivot needed.
- **Phase 2 before Phase 3** because content detection is prerequisite to LLM calls (don't send UI text to API).
- **Phase 3 before Phase 4** because lazy loading optimizes LLM calls, not detection.
- **Phase 5 after core flow works** because confidence tuning requires working transformation pipeline.
- **Phase 6 last** because cache/error handling are optimizations, not core functionality.

### Research Flags

**Needs deeper research during planning:**
- **Phase 1:** TreeWalker on React/Vue fiber trees — needs hands-on spike to verify approach works on actual FB/Reddit DOM.
- **Phase 5:** Confidence threshold heuristics — semantic similarity metrics, prompt engineering for tone preservation, threshold tuning.

**Standard patterns (skip research-phase):**
- **Phase 2:** Content detection selectors — well-documented, site-specific CSS selectors.
- **Phase 3:** LLM API integration — Gemini SDK well-documented, MV3 message passing is boilerplate.
- **Phase 4:** IntersectionObserver — standard Web API, extensive docs.
- **Phase 6:** LRU cache, WeakRef — standard patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | WXT, Gemini Flash, MV3 all verified current. Official docs. Pricing verified 2026-07-26. |
| Features | MEDIUM | Blue ocean claim based on search of existing extensions. No direct competitor found, but market validation needed. |
| Architecture | HIGH | MV3 patterns from MDN official docs. Message passing, storage, content scripts all standard. |
| Pitfalls | HIGH | CORS, React DOM breakage, IntersectionObserver all well-documented. Firefox-specific lifecycle bug cited (1525400). |

**Overall confidence:** HIGH

### Gaps to Address

- **Gemini Flash quality for naturalness transformation** — research verified pricing/latency, but not output quality for this specific use case. Needs prompt engineering validation in Phase 3.
- **WebGPU availability for WebLLM (v2)** — Firefox 113+ supports WebGPU, but adoption rate unknown. Defer to v2, validate when ready.
- **Content detection on dynamic sites** — Facebook/Reddit DOM structures change. Selectors need maintenance strategy. Phase 2 should include selector update mechanism.
- **User trust in passive transformation** — users may not notice extension working. Optional visual indicator needed, but must not break passive experience. UX research gap.

## Sources

### Primary (HIGH confidence)
- MDN WebExtensions docs — manifest.json, content scripts, background scripts, message passing, storage API
- MDN Chrome Incompatibilities — Firefox-specific differences
- MDN Intersection Observer API — lazy loading pattern
- Gemini API pricing page — cost/latency verified 2026-07-26
- WXT documentation — build framework, Firefox support
- Firefox WebGPU support docs — WebLLM feasibility

### Secondary (MEDIUM confidence)
- Grammarly/Wordtune/LanguageTool/DeepL Write feature pages — competitive landscape (writing assistants, not reading transformers)
- Firefox Add-ons store + Chrome Web Store search — no passive reading transformation found
- WebLLM documentation — local inference feasibility

### Tertiary (LOW confidence)
- React/Vue DOM manipulation pitfalls — ecosystem knowledge, not Firefox-specific docs
- LLM API integration patterns — training data, not verified against current Gemini SDK

---
*Research completed: 2026-07-26*
*Ready for roadmap: yes*
