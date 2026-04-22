# Next-step Handoff

This file exists so work can resume in a fresh thread without re-deriving the current parent planning state.

## Current Ready State

- canonical baseline docs are restored
- historical MVP core runtime/evidence work is already in repo
- `docs/mvp/issue-to-e2e-matrix.md` remains the canonical tracker for the completed MVP-core issue set
- wizard research has been archived onto `wizard-ready`
- current main-line work is `#486`: remove the hosted wizard line from `main` and keep only VTDD core

## What Remains Open

At this stage, remaining work is mainly one of:

1. keep `main` honest as the VTDD core line
2. preserve handoff, review, retrieval, and runtime-truth behavior
3. treat any future wizard work as archive/research unless explicitly re-activated

Do not restart implementation from this handoff by assuming missing scope.
Re-check open Issues first.

## Immediate Fresh-thread Steps

1. sync local `main` with `origin/main`
2. check open Issues
3. choose exactly one bounded target Issue
4. if the target is `#486`, remove only hosted wizard surfaces and keep VTDD core intact
5. write a bounded change contract before runtime edits
6. update the Issue-to-E2E matrix only when actual runtime behavior or evidence lands

## Boundary

- do not treat this handoff file as a substitute for Issue text
- do not treat docs-only progress as end-to-end completion
- do not write `Closes #...` unless definition, runnable path, and Butler/worker reachability all hold
