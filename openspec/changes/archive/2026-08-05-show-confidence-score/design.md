## Context

The quality gate (`utils/quality.ts`) already computes `confidenceScore(original, polished)` per applied rewrite, but the value was discarded after the gate check. The result cache stored only `polished` + `ts`. The applied rewrite is a `<span class="text-polished">` whose tooltip currently shows only the original text.

## Goals / Non-Goals

**Goals:**
- Show the confidence score in the page without polluting the rewritten text content.
- Keep the score available for cache hits too.

**Non-Goals:**
- No changes to how the score is computed or to the gate threshold.
- No per-item UI for rejected/low-confidence rewrites (remains silent per the existing spec).

## Decisions

### 1. Carry the score through the result and cache
`TransformResult` gains `confidence?: number`, set from the already-computed gate score. `CacheRecord` stores it; `getCached` returns the record (not just the string), and `transform` reads `hit.polished`/`hit.confidence`.

**Alternatives considered:** Re-scoring cached text at apply time — rejected, wasteful and could drift from the gate's own number.

### 2. Render the badge via CSS, not text
The span gets `data-confidence` and the injected stylesheet shows it with `.text-polished[data-confidence]::after { content: attr(data-confidence); ... }`. The tooltip becomes `Original: …\nConfidence: <n>`.

**Alternatives considered:** Appending ` (95)` to the span text — rejected, that pollutes the visible/copyable rewritten text. A separate badge element — rejected, CSS `::after` is simpler and keeps one span.

### 3. Diagnostic log for partial applies
When `applied < requested`, `polishRoots` logs a breakdown of result errors (e.g. `low-confidence`, `network`) to help diagnose pages where nothing gets rewritten.

## Risks / Trade-offs

- **Badge changes visual layout slightly** → it is a small superscript chip; the highlight span already draws attention.
- **Tooltip `\n` rendering** → browsers render line breaks in `title`; if a browser collapses them, the original text still precedes the score.
