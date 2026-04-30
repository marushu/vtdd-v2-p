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
- confirms Gemini temporary unavailability can request non-manual Codex
  fallback without requiring manual owner PR-comment paste
- confirms VTDD can format and parse `requested` and `completed` fallback reviewer states
- confirms Butler synthesis treats completed Codex fallback review as reviewer evidence rather than request-state only

## Boundary-path Run

Command:

```sh
node --test test/codex-review-fallback.test.js test/gemini-pr-review-workflow.test.js test/execution-continuity.test.js test/butler-review-synthesis.test.js test/reviewer-policy.test.js
```

Observed result on 2026-04-27:
- passed
- confirms missing API-backed reviewer runtime credentials/configuration are
  surfaced as explicit `blocked` fallback state when that optional path is
  selected
- confirms Butler summary preserves the platform blocker instead of degrading
  to manual comment-paste as the normal answer
- confirms reviewer fallback remains critique-only and does not gain merge or deploy authority

## Live Main Receiver Check

Observed result on 2026-04-29 after PR `#112` was merged:

- main fallback receiver run `25088189731` succeeded
- PR `#112` fallback comment was updated to `Status: completed`
- fallback review returned `Recommended action: approve`
- run log recorded `Updated Codex fallback review comment on PR #112.`

This confirms the main-branch fallback receiver can execute the non-manual
Codex reviewer path and write delivered reviewer evidence back to GitHub after
Gemini dispatches a fallback request.

## Default No-API-Key Request Path

Observed correction on 2026-04-30:

- Gemini temporary unavailability now posts or updates a
  `vtdd:reviewer=codex-fallback` request comment using
  `deliveryMode=codex_cloud_github_comment`
- this default request path includes `@codex review`
- this default request path does not require `OPENAI_API_KEY`
- the request remains request-state until Codex Cloud returns a completed
  fallback reviewer marker with a recommended action

This keeps the default reviewer fallback aligned with the operator-owned
ChatGPT/Codex subscription surface. It does not claim that a bot-authored
request has already produced completed reviewer evidence.

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
fallback design: when Gemini is unavailable, VTDD can request Codex Cloud
review through GitHub comment transport by default, or explicitly use an
API-backed workflow only when that cost/account path is selected. It does not
claim live provider pickup or credentials are configured in every operator
repository by default.

Operator prerequisite for default live `completed` state:

- configure and authorize the operator-owned Codex Cloud / ChatGPT GitHub
  integration so it can pick up the `@codex review` request and return critique
  output

Optional API-backed runner prerequisite:

- configure `OPENAI_API_KEY` in the target repository only when the explicit
  API workflow fallback path is selected
