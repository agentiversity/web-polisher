# Text Polisher Extension

## What This Is

A Firefox extension that automatically polishes English text in user-generated content (comments, posts) across web pages like Facebook, Reddit, and others. The extension transforms unnatural or poorly-written English into natural, native-sounding language before the user reads it — completely passively, with no interaction required.

## Core Value

Reading English content that feels natural and native, without awareness of transformation.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Automatically detect user-generated content (comments, posts) on web pages
- [ ] Distinguish user content from UI elements, navigation, ads
- [ ] Polish text for grammar, spelling, and naturalness
- [ ] Transform text silently without user interaction
- [ ] Support lazy loading (transform content as it appears in viewport)
- [ ] Handle 1-2 second transformation delay gracefully
- [ ] Abort transformation below confidence threshold
- [ ] Support small/cheap LLMs (Gemini, Gemma) via API
- [ ] Support local LLM execution on powerful devices
- [ ] Work on Facebook, Reddit, and generic web pages

### Out of Scope

- Grammar/spelling correction only (not naturalness) — insufficient value
- User interaction required (buttons, popups) — breaks passive experience
- Polishing UI/navigation/ads — wrong target, breaks usability
- Real-time polishing as user types — different use case, more complex
- Large/expensive LLMs (GPT-4, Claude) — cost/latency concerns
- Non-English languages — out of scope for v1

## Context

**Problem:** Reading unnatural English (grammatically correct but not native-sounding) is jarring for native speakers. Current tools like Grammarly focus on correctness, not naturalness, and require user interaction.

**Target user:** Native English speaker who wants to read English content that feels natural, without manual intervention or awareness of transformation.

**Technical approach:**
- Small, fast LLMs (Gemini, Gemma) for cost-effective, low-latency transformations
- API-based or local execution depending on user preference and hardware
- Confidence threshold to avoid poor transformations
- Lazy loading to handle pages with many comments efficiently

**Key challenges:**
- Detecting user-generated content vs UI elements reliably across different sites
- Balancing transformation quality with speed and cost
- Knowing when to abort transformation (confidence threshold)
- Handling diverse writing styles and contexts

## Constraints

- **Browser**: Firefox extension — required platform
- **Performance**: 1-2 second delay acceptable — must not feel sluggish
- **Cost**: Small/cheap LLMs only — large models too expensive for frequent use
- **Quality**: Confidence threshold required — bad transformations worse than no transformation
- **Scope**: User-generated content only — UI/navigation must remain untouched

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Passive/invisible transformation | User wants seamless experience, no interaction | — Pending |
| User-generated content only | UI/navigation polishing breaks usability | — Pending |
| Small/cheap LLMs | Cost-effective for frequent use, low latency | — Pending |
| Confidence threshold | Avoid making text worse than original | — Pending |
| Lazy loading | Handle pages with many comments efficiently | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-26 after initialization*
