# E2E-27 No-Manual Codex Reviewer Fallback

This document records concrete run evidence for the E2E-27 track.

## Scope

Issues:
- `#84`
- parent anchor: `#4`

Goal:
- confirm Gemini unavailable can advance into a non-manual Codex reviewer fallback path
- confirm VTDD can represent requested, completed, and blocked Codex fallback reviewer states without requiring owner PR-comment paste
- confirm Butler summary can consume those states without treating request-state as delivered review
- confirm VTDD does not degrade to manual PR-comment paste as the normal fallback answer

## Happy-path Run

Command:

```sh
node --test test/codex-review-fallback.test.js test/gemini-review-failure.test.js test/gemini-pr-review-workflow.test.js test/execution-continuity.test.js test/butler-review-synthesis.test.js test/reviewer-policy.test.js
```

Observed result on 2026-04-27:
- passed
- confirms Gemini temporary unavailability can dispatch a non-manual Codex fallback workflow instead of relying on bot-authored `@codex review`
- confirms VTDD can format and parse `requested` and `completed` fallback reviewer states
- confirms Butler synthesis treats completed Codex fallback review as reviewer evidence rather than request-state only

## Boundary-path Run

Command:

```sh
node --test test/codex-review-fallback.test.js test/gemini-pr-review-workflow.test.js test/execution-continuity.test.js test/butler-review-synthesis.test.js test/reviewer-policy.test.js
```

Observed result on 2026-04-27:
- passed
- confirms missing reviewer runtime credentials/configuration are surfaced as explicit `blocked` fallback state
- confirms Butler summary preserves the platform blocker instead of degrading to manual comment-paste as the normal answer
- confirms reviewer fallback remains critique-only and does not gain merge or deploy authority

## Evidence Files

- `.github/workflows/gemini-pr-review.yml`
- `.github/workflows/codex-pr-review-fallback.yml`
- `scripts/run-gemini-pr-review.mjs`
- `scripts/run-codex-pr-review-fallback.mjs`
- `src/core/codex-review-fallback.js`
- `src/core/execution-continuity.js`
- `src/core/butler-review-synthesis.js`
- `docs/security/reviewer-policy.md`
- `docs/butler/gemini-pr-review-comments.md`
- `test/codex-review-fallback.test.js`
- `test/gemini-pr-review-workflow.test.js`
- `test/execution-continuity.test.js`
- `test/butler-review-synthesis.test.js`
- `test/reviewer-policy.test.js`

## Current Reading

E2E-27 now has recorded happy-path and boundary-path run evidence in-repo.

This confirms Issue `#84` is connected to a VTDD-managed no-manual reviewer
fallback design: when Gemini is unavailable, VTDD can either dispatch a
non-manual Codex fallback review workflow or explicitly surface the runtime
blocker. It does not claim live provider credentials are configured in every
operator repository by default.

Operator prerequisite for live `completed` state:

- configure `OPENAI_API_KEY` in the target repository so the Codex fallback
  workflow can run critique-only review instead of remaining `blocked`
