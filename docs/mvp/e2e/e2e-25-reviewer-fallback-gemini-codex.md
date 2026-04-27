# E2E-25 Reviewer Fallback Request-State Preservation

This document records concrete run evidence for the E2E-25 track.

## Scope

Issues:
- `#74`
- parent anchor: `#4`

Goal:
- confirm Gemini remains the primary reviewer when available
- confirm Gemini quota/rate-limit exhaustion does not hard-fail the PR solely for reviewer quota reasons
- confirm VTDD can preserve an explicit GitHub-visible Codex fallback request-state while preserving critique-only reviewer separation

## Happy-path Run

Command:

```sh
node --test test/codex-review-fallback.test.js test/gemini-review-failure.test.js test/gemini-pr-review.test.js test/gemini-pr-review-workflow.test.js test/execution-continuity.test.js test/butler-review-synthesis.test.js test/reviewer-registry.test.js
```

Observed result on 2026-04-27:
- passed
- confirms quota/rate-limit failures are classified as reviewer unavailability rather than generic hard failure
- confirms VTDD can format and detect a GitHub-visible Codex fallback request-state comment
- confirms execution continuity and Butler synthesis expose `codex_review_requested` distinctly from `gemini_review_available`
- confirms Gemini-first behavior remains canonical when reviewer evidence is available again

## Boundary-path Run

Command:

```sh
node --test test/codex-review-fallback.test.js test/gemini-review-failure.test.js test/execution-continuity.test.js test/butler-review-synthesis.test.js
```

Observed result on 2026-04-27:
- passed
- confirms fallback request state does not grant execution credentials or merge authority
- confirms review absence is surfaced explicitly as reviewer evidence missing / fallback requested, rather than being hidden behind a green path
- confirms repo-side automation does not overclaim that Codex critique has already been delivered when only the fallback request exists

## Evidence Files

- `scripts/run-gemini-pr-review.mjs`
- `.github/workflows/gemini-pr-review.yml`
- `src/core/codex-review-fallback.js`
- `src/core/gemini-review-failure.js`
- `src/core/execution-continuity.js`
- `src/core/butler-review-synthesis.js`
- `docs/security/reviewer-policy.md`
- `docs/butler/gemini-pr-review-comments.md`
- `test/codex-review-fallback.test.js`
- `test/gemini-review-failure.test.js`
- `test/gemini-pr-review-workflow.test.js`
- `test/execution-continuity.test.js`
- `test/butler-review-synthesis.test.js`

## Current Reading

E2E-25 now has recorded happy-path and boundary-path run evidence in-repo.

This confirms Issue `#74` is connected to a repo-side fallback request path
that keeps Gemini as primary, records Codex fallback request state, and
preserves critique-only reviewer boundaries.

It does not claim that request-state alone solves the no-manual fallback path.
The non-manual delivered/blocker path is tracked by open Issue `#84`.
