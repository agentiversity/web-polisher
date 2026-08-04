## Why

The `user-experience` capability spec was written directly into `openspec/specs/user-experience/spec.md` by an earlier automation pass — before the OpenSpec change → archive workflow was used consistently. The behavior it describes is already implemented (modal, highlight span with tooltip originals, silent-on-failure) and verified by the E2E harness, but there is no change record: no proposal, no design, no task list, and no archived entry tying the requirement to the work.

This change retro-adopts the capability into the normal workflow so the ledger is complete and future changes to UX have a proper baseline.

## What Changes

- Create a `user-experience` change whose delta spec mirrors the existing main-spec requirements exactly, so archiving is a **no-op merge** (the main spec is unchanged — it already contains these requirements).
- Capture the actual implemented design decisions (modal, highlight span with tooltip originals, silent failure) in `design.md`, and the already-completed work in `tasks.md`.
- **No runtime code changes.** This is a paper-trail restoration only.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `user-experience`: existing requirements are restated unchanged via a MODIFIED delta so the capability gains a change record without altering behavior.

## Impact

- **New files**: `openspec/changes/user-experience/` (proposal, design, delta spec, tasks).
- **No changes** to `entrypoints/`, `utils/`, `wxt.config.ts`, or any runtime dependency.
- Main spec `openspec/specs/user-experience/spec.md` is expected to end this change byte-for-byte identical to how it started.
