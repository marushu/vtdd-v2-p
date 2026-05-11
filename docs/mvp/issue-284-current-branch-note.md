# Issue #284 current branch note

Date: 2026-05-11
Branch: `codex/issue-284-v3`

## Scope

Issue: `#284`

Canonical intent: Butler must read PR conflict / mergeability runtime truth before
merge judgment and propose a fresh branch / fresh PR instead of merge when a PR
is conflicted, including when reviewer evidence is approve.

## Current branch state

This branch currently points at the same commit as `origin/main` and has no
runtime implementation diff to open as an Issue #284 implementation PR.

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

Initial local test execution failed because dependencies were not installed:

```sh
node --test test/butler-review-synthesis.test.js test/execution-continuity.test.js test/github-read-plane.test.js test/github-high-risk-plane.test.js test/e2e-31-pr-mergeability-preflight.test.js
```

Observed failure:

- `ERR_MODULE_NOT_FOUND`: missing package `@simplewebauthn/server`

After running `npm install`, executed locally on 2026-05-11:

```sh
node --test test/butler-review-synthesis.test.js test/execution-continuity.test.js test/github-read-plane.test.js test/github-high-risk-plane.test.js test/e2e-31-pr-mergeability-preflight.test.js
```

Result: passed, 42 tests.

Executed locally on 2026-05-11:

```sh
npm run check:generated-worker
```

Result: passed.

## Stop reason

Opening a normal implementation PR from this branch is blocked because there is
no runtime code diff against `origin/main`. Creating an implementation-looking
PR from a no-op or unrelated runtime change would obscure Issue traceability.

The remaining Issue #284 success criterion that is not locally satisfiable in
this bounded run is production Cloudflare runtime reflection. Deploy was not
performed because the task explicitly forbids deploy.

No merge, deploy, secret mutation, permission mutation, repository setting
mutation, Issue closure, or external infrastructure mutation was performed.
