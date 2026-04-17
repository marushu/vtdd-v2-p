# Next-step Handoff

This file exists so work can resume in a fresh thread without re-deriving the current parent planning state.

## Current Ready State

- `#13` has already been rewritten as the MVP execution anchor
- canonical baseline docs are restored
- setup surface, policy surface, reviewer surface, retrieval surface, deploy surface, and safety surfaces are connected
- `docs/mvp/issue-to-e2e-matrix.md` is the canonical repository-wide completion tracker
- repository reading is still `partial / in-progress`

## What Remains Open

At this stage, remaining work is mainly one of:

1. parent/spec drift prevention
2. E2E evidence completion
3. human closure judgment

Do not restart implementation from this handoff by assuming missing scope.
Re-check open Issues first.

## Immediate Fresh-thread Steps

1. sync local `main` with `origin/main`
2. check open Issues
3. choose exactly one bounded target Issue
4. write a bounded change contract before runtime edits
5. update the Issue-to-E2E matrix when new behavior or evidence lands

## Boundary

- do not treat this handoff file as a substitute for Issue text
- do not treat docs-only progress as end-to-end completion
- do not write `Closes #...` unless definition, runnable path, and Butler/worker reachability all hold
