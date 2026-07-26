# Feature Landscape

**Domain:** Browser extension for passive text polishing (reading transformation)
**Researched:** 2026-07-26
**Confidence:** MEDIUM

## Executive Summary

**Critical finding:** No direct competitors exist. All existing text extensions (Grammarly, Wordtune, LanguageTool, DeepL Write, text simplifiers) are **writing assistants** requiring user interaction. This project occupies a **blue ocean** — passive reading transformation.

Existing tools help users **write** better. This tool transforms what users **read**. Fundamental difference.

## Table Stakes

Features users expect from ANY text extension. Missing = product feels broken or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Reliable content detection** | Must distinguish user content from UI/navigation/ads | High | Core technical challenge. Must work across Facebook, Reddit, generic sites |
| **Natural transformation** | Transform for naturalness, not just grammar | High | Differentiator from Grammarly. Must sound native, not just correct |
| **Invisible operation** | No user interaction required | Medium | Core value prop. No buttons, popups, or manual triggers |
| **Graceful latency handling** | 1-2 second delay acceptable | Medium | Must not feel sluggish. Loading states or progressive enhancement |
| **Confidence threshold** | Abort transformation if quality low | High | Bad transformation worse than no transformation. Critical quality gate |
| **Site-specific support** | Work on Facebook, Reddit | Medium | Must handle dynamic content, infinite scroll, lazy loading |
| **Privacy/no data storage** | Users trust extension with their reading | Low | No text sent to servers unless using API. Local-first preferred |
| **Performance** | Fast response, no page slowdown | Medium | Lazy loading essential for pages with many comments |
| **Browser compatibility** | Firefox extension required | Low | Target platform. Must follow Firefox extension guidelines |

## Differentiators

Features that set product apart. Not expected, but highly valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Passive transformation** | Zero interaction. Text transforms as you read | High | **UNIQUE** — no competitor does this. Core differentiator |
| **Naturalness focus** | Transform unnatural English to native-sounding | High | Grammarly fixes correctness. This fixes naturalness. Different problem |
| **Small/cheap LLM support** | Use Gemini, Gemma instead of GPT-4/Claude | Medium | Cost-effective for frequent use. Enables free/cheap tier |
| **Local LLM execution** | Run on-device for powerful hardware | High | Privacy benefit. No API costs. Reduces latency |
| **Lazy loading** | Transform content as it appears in viewport | Medium | Performance optimization. Essential for infinite scroll pages |
| **Selective transformation** | Transform only user-generated content | High | Must not touch UI, navigation, ads. Requires sophisticated detection |
| **Confidence-based abort** | Skip transformation when quality uncertain | High | Prevents bad transformations. Builds user trust |
| **Progressive enhancement** | Show original text while transformation loads | Low | Better UX than blank space or loading spinner |

## Anti-Features

Features to explicitly NOT build. These break the core value proposition.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **User interaction required** | Breaks passive experience. Core value = invisible | Make it fully automatic. No buttons, no popups |
| **Grammar/spelling only** | Insufficient value. Grammarly already does this | Focus on naturalness transformation, not correctness |
| **Polish UI/navigation/ads** | Wrong target. Breaks usability | Detect and exclude non-user content |
| **Real-time as-you-type** | Different use case (writing vs reading). More complex | Transform content user is reading, not writing |
| **Large/expensive LLMs** | GPT-4, Claude too expensive for frequent use | Use small models (Gemini, Gemma) or local execution |
| **Non-English languages** | Out of scope for v1. Expands complexity massively | English-only for initial release |
| **Manual trigger buttons** | Breaks passive experience | Automatic transformation on page load/scroll |
| **Transformation history/undo** | Adds complexity. Users don't need to revert passive changes | Keep it simple. If bad transform, user can refresh page |
| **Writing assistance features** | Competes with Grammarly. Wrong product category | Stay focused on reading transformation |
| **Cloud-only processing** | Privacy concern. Adds latency | Support local execution where possible |

## Feature Dependencies

```
Reliable content detection → Selective transformation (must detect before transforming)
Confidence threshold → Natural transformation (must evaluate quality before applying)
Lazy loading → Graceful latency handling (must manage user expectations during load)
Small/cheap LLM support → Local LLM execution (local is extension of small model strategy)
Site-specific support → Reliable content detection (each site has different DOM structure)
```

**Critical path:**
1. Content detection (foundation)
2. Transformation engine (core)
3. Confidence threshold (quality gate)
4. Lazy loading (performance)
5. Site-specific support (deployment)

## MVP Recommendation

**Prioritize:**
1. **Reliable content detection** — Must work on Facebook and Reddit first
2. **Natural transformation** — Core value. Must sound native, not just correct
3. **Passive operation** — Zero interaction. This is the differentiator
4. **Confidence threshold** — Abort bad transformations. Builds trust
5. **Graceful latency handling** — 1-2 second delay acceptable if handled well

**Defer:**
- **Local LLM execution** — API-first is simpler. Add local later for privacy-focused users
- **Generic site support** — Nail Facebook/Reddit first, then expand
- **Advanced settings** — Keep it simple. Auto is the only mode for v1

## Competitive Landscape

### Writing Assistants (NOT competitors, but context)
- **Grammarly** — Grammar, spelling, tone, clarity. Interactive. 40M users
- **Wordtune** — Paraphrasing, rewriting, summarization. Interactive. 10M users
- **LanguageTool** — Grammar, spelling, style. Interactive. Open source
- **DeepL Write** — Writing enhancement, tone adjustment. Interactive

### Text Simplification (closest category, but still interactive)
- **Simplify** — Transform complex text to plain English. User-triggered
- **Text Simplifier** — Simplify text on webpages. User-triggered
- **Dumbify** — Make complex texts readable. User-triggered

### Translation (different use case)
- **DeepL Translator** — Translate between languages. User-triggered
- **Google Translate** — Translation. User-triggered

**Gap:** No passive reading transformation exists. This is the opportunity.

## User Experience Considerations

### What users expect (based on existing extensions)
- Fast response (<2 seconds)
- Works across websites
- Privacy-respecting
- Easy to install and use

### What users DON'T expect (this is new)
- Text changing automatically as they read
- No interaction required
- Invisible operation

**Risk:** Users may not notice transformation is happening. Need subtle feedback mechanism (optional) to build trust that extension is working.

**Mitigation:** Optional visual indicator (subtle icon, tooltip) showing transformation occurred. Must be dismissible to maintain passive experience.

## Technical Constraints Impacting Features

| Constraint | Feature Impact |
|------------|----------------|
| **Firefox-only** | Limits market size but simplifies development |
| **1-2 second latency acceptable** | Enables API-based LLM calls. Must handle gracefully |
| **Small/cheap LLMs only** | Limits transformation quality. Must set expectations |
| **Confidence threshold required** | Adds complexity but prevents bad UX |
| **User-generated content only** | Requires sophisticated detection. Core technical challenge |

## Sources

- Grammarly features page (webfetch, MEDIUM confidence)
- Wordtune features page (webfetch, MEDIUM confidence)
- LanguageTool features page (webfetch, MEDIUM confidence)
- DeepL Write features page (webfetch, MEDIUM confidence)
- Firefox Add-ons store search (webfetch, MEDIUM confidence)
- Chrome Web Store search (webfetch, MEDIUM confidence)
