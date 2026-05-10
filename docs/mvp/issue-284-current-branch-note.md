# Issue #284 current branch note

Date: 2026-05-11
Branch: `codex/issue-284-v2`

## Scope

Issue: `#284`

Canonical intent: Butler must read PR conflict / mergeability runtime truth before
merge judgment and propose a fresh branch / fresh PR instead of merge when a PR
is conflicted, including when reviewer evidence is approve.

## Current branch state

This branch currently points at the same commit as `origin/main` and has no
implementation diff to open as an Issue #284 PR.

The Issue #284 behavior appears already present in the repository through the
current main-line implementation:

- `src/core/github-read-plane.js`
- `src/core/github-mergeability.js`
- `src/core/github-high-risk-plane.js`
- `src/core/butler-review-synthesis.js`
- `src/core/execution-continuity.js`
- `worker.js`
- `docs/mvp/e2e/e2e-31-pr-mergeability-preflight.md`

## Verification run

Executed locally on 2026-05-11:

```sh
node --test test/butler-review-synthesis.test.js test/execution-continuity.test.js test/github-read-plane.test.js test/github-high-risk-plane.test.js test/e2e-31-pr-mergeability-preflight.test.js
```

Result: passed, 42 tests.

Executed locally on 2026-05-11:

```sh
npm test
```

Result: passed, 647 tests; 1 skipped live read-only conflicting PR fixture.

## Stop reason

Opening a normal implementation PR from this branch is blocked because there is
no code/runtime diff against `origin/main`. Creating an implementation-looking
PR from a no-op or unrelated change would obscure Issue traceability.

No deploy, merge, secret mutation, permission mutation, repository setting
mutation, or external infrastructure mutation was performed.
