# Roadmap: Text Polisher Extension

## Overview

Build a Firefox extension that passively transforms user-generated English text into natural-sounding language as users read. The journey starts with proving safe DOM manipulation on React sites, then layers content detection, LLM-powered transformation, performance optimization, and quality gates. Each phase delivers a verifiable capability that builds toward invisible, high-quality text polishing.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Safe Text Replacement** - Prove TreeWalker-based text replacement works on React sites without breaking UI
- [ ] **Phase 2: Content Detection & Site Support** - Detect user-generated content and exclude UI elements across generic sites
- [ ] **Phase 3: LLM Transformation Engine** - Transform text for naturalness via Gemini Flash through background service worker
- [ ] **Phase 4: Performance & Lazy Loading** - Handle dynamic content and infinite scroll without page slowdown
- [ ] **Phase 5: Quality & Confidence** - Abort poor transformations and ensure quality gate

## Phase Details

### Phase 1: Foundation & Safe Text Replacement
**Goal**: Extension loads and safely replaces text on React-based sites (Facebook, Reddit) without breaking the UI
**Depends on**: Nothing (first phase)
**Requirements**: UX-01, UX-02
**Success Criteria** (what must be TRUE):
  1. Extension installs and loads on Firefox without errors
  2. Text replacement works on Facebook and Reddit without breaking React fiber tree
  3. User sees transformed text without any interaction (buttons, popups, or manual triggers)
  4. Original page functionality (clicking, scrolling, navigating) remains intact after text replacement
**Plans**: 3 plans

Plans:
- [ ] 01-01: WXT project scaffold with Firefox MV3 manifest
- [ ] 01-02: TreeWalker-based text node replacer (preserve React state)
- [ ] 01-03: Basic content script + background service worker structure

### Phase 2: Content Detection & Site Support
**Goal**: Extension detects user-generated content (comments, posts) and excludes UI elements, navigation, and ads across generic web pages
**Depends on**: Phase 1
**Requirements**: DET-01, DET-02, SITE-01, SITE-02
**Success Criteria** (what must be TRUE):
  1. User-generated content (comments, posts) automatically detected on any web page
  2. UI elements (buttons, navigation, ads, labels) excluded from transformation
  3. Extension adapts to different site structures without site-specific code
  4. Generic web pages with user-generated content supported (not just Facebook/Reddit)
**Plans**: 3 plans

Plans:
- [ ] 02-01: Content detection heuristics (identify user-generated content)
- [ ] 02-02: Exclusion rules (filter out UI elements, navigation, ads)
- [ ] 02-03: Generic site adapter (work across different site structures)

### Phase 3: LLM Transformation Engine
**Goal**: Transform text for naturalness (not just grammar/spelling) using small, cheap LLMs via API, operating passively without user interaction
**Depends on**: Phase 2
**Requirements**: TRANS-01, TRANS-02, TRANS-03, TRANS-04
**Success Criteria** (what must be TRUE):
  1. Text transformed for naturalness, not just grammar and spelling correction
  2. Original meaning preserved during transformation
  3. Transformation operates passively without user interaction
  4. Small, cheap LLMs (Gemini Flash) used via API through background service worker
**Plans**: 4 plans

Plans:
- [ ] 03-01: Background service worker with Gemini Flash API client
- [ ] 03-02: Message passing (content script ↔ background)
- [ ] 03-03: Naturalness transformation prompt engineering
- [ ] 03-04: API key management (user settings page)

### Phase 4: Performance & Lazy Loading
**Goal**: Handle dynamic content (infinite scroll, lazy loading) and prevent page slowdown by processing content only as it appears in viewport
**Depends on**: Phase 3
**Requirements**: DET-03, PERF-01, PERF-02, PERF-03
**Success Criteria** (what must be TRUE):
  1. Dynamic content (infinite scroll, lazy-loaded comments) detected and processed
  2. Transformations lazy-loaded — content processed only as it appears in viewport
  3. 1-2 second transformation delay handled gracefully (no perceived sluggishness)
  4. Page performance not degraded (no scroll jank, no slowdown)
**Plans**: 4 plans

Plans:
- [ ] 04-01: IntersectionObserver for lazy loading (200px rootMargin)
- [ ] 04-02: Dynamic content detection (MutationObserver for infinite scroll)
- [ ] 04-03: Concurrent request limiting (max 2-3 API calls)
- [ ] 04-04: Graceful latency handling (progressive enhancement)

### Phase 5: Quality & Confidence
**Goal**: Abort transformations below confidence threshold and evaluate transformation quality before applying changes
**Depends on**: Phase 4
**Requirements**: QUAL-01, QUAL-02
**Success Criteria** (what must be TRUE):
  1. Transformations aborted when confidence below threshold (poor changes not applied)
  2. Transformation quality evaluated before applying (semantic similarity, length check)
  3. Original text shown when transformation fails quality gate
  4. Confidence threshold tunable (conservative default with adjustment path)
**Plans**: 3 plans

Plans:
- [ ] 05-01: Confidence scoring logic (semantic similarity + length preservation)
- [ ] 05-02: Quality gate implementation (abort below threshold)
- [ ] 05-03: Threshold tuning mechanism (settings page)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Safe Text Replacement | 0/3 | Not started | - |
| 2. Content Detection & Site Support | 0/3 | Not started | - |
| 3. LLM Transformation Engine | 0/4 | Not started | - |
| 4. Performance & Lazy Loading | 0/4 | Not started | - |
| 5. Quality & Confidence | 0/3 | Not started | - |
