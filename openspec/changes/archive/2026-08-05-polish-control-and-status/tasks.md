## 1. Pipeline pause/resume + status

- [x] 1.1 Add `PipelineStatus` type, `paused` flag, `inFlight` counter, `state` getter, and a status callback to `PolishPipeline`
- [x] 1.2 Add `pause()`/`resume()` and `recomputeStatus()`; `waitWhilePaused` and `scheduleScan` also defer while paused
- [x] 1.3 Route the initial pass through the serial chain so it is pausable
- [x] 1.4 Export `pausePolish()`/`resumePolish()`/`currentPipelineState()`

## 2. Content script toggle + status reporting

- [x] 2.1 Make `apply-polish` a toggle (start/pause/resume) using a persistent `PolishPipeline` per page
- [x] 2.2 Report lifecycle status (`polisher-status`) to the background; report `idle` on load
- [x] 2.3 Keep start-reply semantics (resolves after the initial pass) for the E2E harnesses

## 3. Background status icons

- [x] 3.1 Handle `polisher-status` and set the per-tab action icon (gray/blue/amber/green)
- [x] 3.2 Re-apply the icon on tab activation; reset to idle on navigation
- [x] 3.3 Extend `scripts/generate-icons.mjs` to render status variants at all sizes and regenerate

## 4. Popup immediate close

- [x] 4.1 Polish button sends `apply-polish` fire-and-forget and closes the popup immediately

## 5. Tests & verification

- [x] 5.1 Pipeline tests: pause/resume of queued work, status transitions (running→paused→running, done)
- [x] 5.2 `npm run compile` and `npm test` green
- [x] 5.3 `build:firefox` clean; status icons present in the build
- [x] 5.4 Chrome E2E green (apply flow intact)
