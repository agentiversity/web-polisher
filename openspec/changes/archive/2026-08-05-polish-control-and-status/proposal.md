## Why

Polishing a page with lots of text can take a while (one LLM call per text node), and once started there was no way to stop it or tell what it was doing. The toolbar gave no feedback until highlights appeared. The user needs control over the running pass and a persistent status indication.

## What Changes

- The popup's "Polish Page" button now **toggles** the pass: not started/done → start; running → **pause**; paused → **resume** from where it left off, until finished.
- The popup **closes immediately** when Polish is pressed (polishing continues in the tab).
- The **toolbar icon reflects lifecycle status**: gray = not started, blue = in progress, amber = paused, green = complete (per tab).
- Work pauses between per-node LLM calls (each node is its own batch), so the toggle takes effect promptly.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities
- `user-actions`: The action-button flow is now a toggle (start/pause/resume) and the popup closes immediately on trigger.
- `user-experience`: The toolbar icon shows the polishing lifecycle state (not started / in progress / paused / complete).

## Impact

- `utils/pipeline.ts`: `PolishPipeline` gains `pause()`, `resume()`, a `state` getter, a status callback, and routes the initial pass through the serial chain so it can be paused.
- `entrypoints/content.ts`: apply-polish becomes a toggle controller; reports lifecycle status to the background.
- `entrypoints/background.ts`: handles `polisher-status` and sets the per-tab action icon (idle/running/paused/done); resets on navigation and tab activation.
- `entrypoints/popup/index.ts`: Polish button closes the popup immediately (fire-and-forget message).
- `scripts/generate-icons.mjs`: renders status icon variants (gray/blue/amber/green) at all sizes.
- Tests: pipeline pause/resume/status.
