## 1. Content detector module

- [x] 1.1 [Module] Create `utils/contentDetector.ts` with a two-stage detector (negative exclusion wins over positive/heuristic match)
- [x] 1.2 [Positives] Detect user content via known content selectors and signals (article, comment/post containers; also `<article>`/`<blockquote>` tags and `role=article/comment/feed`)
- [x] 1.3 [Heuristics] Add a heuristic fallback (text length, low interactivity, not inside excluded region) for unknown sites
- [x] 1.4 [API] Expose a function to collect user-content root nodes for a given element

## 2. Exclusion rules

- [x] 2.1 [Negatives] Detect and exclude UI/nav/ads/labels, including non-`<button>` interactive wrappers (div/span acting as buttons)
- [x] 2.2 [Ancestors] Check an element and its interactive ancestors, not just the direct parent (fixes the Reddit finding)
- [x] 2.3 [Order] Ensure exclusion wins over positive/heuristic match for any conflicting node

## 3. Generic site adapter

- [x] 3.1 [Registry] Create a per-site selector registry (hostname → content/exclude selectors) as data, not hardcoded logic
- [x] 3.2 [Known sites] Add Reddit and Facebook entries (content + exclude selectors), including the Reddit widget/button wrappers seen in testing
- [x] 3.3 [Fallback] Unknown sites use generic heuristics with no code change to support a new site

## 4. Integrate into the apply flow

- [x] 4.1 [Wire] In the `apply-polish` handler, run the detector first, then replace only within detected user-content roots
- [x] 4.2 [Keep flow] Keep the click-to-apply gating and the message round-trip unchanged
- [x] 4.3 [Guard] Reuse/retire the old `isUiElement` path as appropriate so buttons are no longer altered on Reddit (detector is now primary; isUiElement kept as secondary safety net)

## 5. Tests & build

- [x] 5.1 [Unit tests] Detection, exclusion (incl. non-tag wrappers and ancestors), and site fallback (15 new tests; 22 total pass)
- [x] 5.2 [Build] Firefox build + typecheck clean
- [x] 5.3 [Manual] (on host) Click button on Reddit: comments polished, button text untouched
  > **VERIFIED on host (www.reddit.com, comment-rich thread)**: comment body text
  > gets the `[text-polisher]` prefix; button/widget labels (Reply/Share/Save) stay
  > unchanged. Also validated no UI/nav/ad/screen-reader text is prefixed.
