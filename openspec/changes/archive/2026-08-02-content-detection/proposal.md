## Why

Phase 1 proved safe text replacement and click-to-apply, but its UI-exclusion guard is a basic stopgap. On Reddit it failed to exclude some interactive wrappers that aren't `<button>` tags, so button text got altered. Phase 2 replaces that stopgap with **real content detection**: reliably identify user-generated content and reliably exclude UI/navigation/ads, on both known (Facebook, Reddit) and generic sites. This must precede LLM transformation (Phase 3) — we must never send UI text to the API or polish button labels.

## What Changes

- A **Content Detector** that identifies user-generated content (comments, posts) using positive signals with a heuristic fallback.
- **Exclusion rules** that reliably filter UI, navigation, ads, and labels — including non-`<button>` interactive wrappers (the Reddit finding).
- A **generic site adapter**: per-site selector sets for known sites, heuristic fallback for unknown ones, and no code change required to support a new site.
- **Wire detection into the click-to-apply flow** so only detected user content is polished.

## Capabilities

### New Capabilities
<!-- None. Phase 2 implements and refines the existing content-detection capability. -->

### Modified Capabilities
- `content-detection`: strengthens UI exclusion (non-native interactive wrappers such as `div`/`span` buttons) and makes site adaptability concrete (per-site selector registry with generic fallback).

## Impact

- New content-script detector module (`utils/contentDetector.ts`) + a per-site selector registry.
- Integration into `entrypoints/content.ts`'s `apply-polish` flow: run detection first, then replace only detected user content.
- Unit tests for detection, exclusion, and site fallback.
- **Out of scope here:** dynamic-content lazy loading (DET-03) is Phase 4; LLM transformation (TRANS-*) is Phase 3; the apply button stays click-gated (no auto-apply).
