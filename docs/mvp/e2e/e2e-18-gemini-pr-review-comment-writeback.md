# E2E-18 Gemini PR Review Comment Writeback Evidence

This document records concrete run evidence for the E2E-18 track.

## Scope

Issues:
- `#9`
- `#12`
- parent anchor: `#13`

Goal:
- confirm the runnable `PR -> Gemini review comment` path is connected
- confirm PR comment writeback uses the GitHub App credential model instead of an inaccessible return token path
- confirm reruns update the VTDD Gemini review comment surface without giving the reviewer execution or merge authority

## Happy-path Run

Observed live evidence on 2026-04-25:

- PR: [#28 Add test PR note for live Gemini review](https://github.com/marushu/vtdd-v2-p/pull/28)
- Gemini review comment:
  - [vtdd-codex reviewer comment](https://github.com/marushu/vtdd-v2-p/pull/28#issuecomment-4317590536)
- Workflow run:
  - [gemini-pr-review / review](https://github.com/marushu/vtdd-v2-p/actions/runs/24920443157/job/72980775527)

Observed result:
- the reviewer workflow completed successfully on `pull_request_target`
- the PR received a traceable Gemini review comment carrying the VTDD reviewer marker
- the review comment shows `Trigger: pull_request_target:opened`
- the reviewer remained critique-only and did not gain merge or execution authority

## Boundary-path Run

Command:

```sh
node --test test/gemini-pr-review-workflow.test.js test/gemini-pr-review.test.js
```

Observed result on 2026-04-26:
- passed
- confirms the workflow skips when `VTDD_GITHUB_APP_ID` / `VTDD_GITHUB_APP_PRIVATE_KEY` are not configured
- confirms the workflow mints a GitHub App token and passes it as `GITHUB_TOKEN` to `scripts/run-gemini-pr-review.mjs`
- confirms rerun triggers ignore the reviewer marker to avoid uncontrolled comment loops
- confirms reviewer output remains PR-comment writeback only and does not grant execution credentials or merge authority

## Evidence Files

- `.github/workflows/gemini-pr-review.yml`
- `scripts/run-gemini-pr-review.mjs`
- `docs/butler/gemini-pr-review-comments.md`
- `test/gemini-pr-review-workflow.test.js`
- `test/gemini-pr-review.test.js`

## Current Reading

E2E-18 now has recorded live happy-path evidence and in-repo boundary-path
evidence.

This confirms the reviewer runtime is connected through the GitHub App token
writeback path without collapsing the reviewer role into execution authority.
