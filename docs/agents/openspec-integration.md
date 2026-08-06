# OpenSpec integration

How the engineering skills and OpenSpec split responsibilities in this repo.

## The one-spec-home rule

Per feature/change, the spec lives in **exactly one** place:

- **OpenSpec change** (`openspec/changes/<change>/` — proposal, design, tasks, delta specs): the default for feature work in this repo.
- **Issue-tracker chain** (`/to-spec` → `/to-tickets` → GitHub issues): only when a feature is deliberately run outside OpenSpec.

Never write the same spec to both. If a change is already an OpenSpec change, feed it with the thinking skills and implement via `openspec-apply-change`; do not also run `to-spec`/`to-tickets` for it. GitHub issues remain the surface for triaging incoming bugs/requests, not for feature specs.

## Division of labor

pocock skills own:

- Thinking & vocabulary: `/grill-with-docs`, `/domain-modeling` (`CONTEXT.md` + `docs/adr/`), `/codebase-design`.
- Incoming work: `/triage` (GitHub issues for things not created here).
- Diagnosis & review: `/diagnosing-bugs`, `/code-review`, `/research`.

OpenSpec owns:

- The change lifecycle: `openspec-propose` → `openspec-update-change` → `openspec-apply-change` → `openspec-sync-specs` → `openspec-archive-change`.
- `openspec-explore` is the explore mode for a change; `/grilling` is the fallback when no change exists yet.

`tdd` and `/code-review` are format-agnostic and run inside either flow.

## Review caveat

`/code-review` locates the originating spec via the issue tracker / `docs/` / `.scratch/` — it does **not** scan `openspec/changes/`. When reviewing an OpenSpec change, pass the change's spec path explicitly (e.g. `openspec/changes/<name>/specs/<capability>/spec.md`).
