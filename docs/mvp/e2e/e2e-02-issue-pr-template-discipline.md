# E2E-02 Issue and PR Template Discipline Evidence

This document records concrete run evidence for the E2E-02 track.

## Scope

Issues:
- `#14`
- `#15`
- `#16`
- parent anchor: `#13`

Goal:
- confirm Issue and PR artifacts are constrained by canonical template sections
- confirm required-check enforcement rejects PRs when mandatory evidence markers are missing
- confirm template discipline remains blocking instead of advisory

## Happy-path Run

Command:

```sh
node --test test/issue-template-model.test.js test/pr-template-model.test.js
```

Observed result on 2026-04-17:
- passed
- confirms the issue template contains required intent, success criteria, completion gate, validation plan, non-goal, and related-issues sections in canonical order
- confirms the PR template contains required intent, satisfied/unsatisfied criteria, verification evidence, and related constitution sections in canonical order
- confirms verification slots remain explicit in both templates

## Boundary-path Run

Command:

```sh
node --test test/guarded-semi-automation-mode.test.js
```

Observed result on 2026-04-17:
- passed
- confirms the required-check workflow exists and includes the `guarded-policy` and `test` jobs
- confirms review-gate wiring remains present via `CODEOWNERS`
- confirms PRs missing required evidence markers are meant to be blocked by the guarded-policy workflow, not accepted as advisory-only

## Evidence Files

- `test/issue-template-model.test.js`
- `test/pr-template-model.test.js`
- `test/guarded-semi-automation-mode.test.js`
- `docs/issue-template-model.md`
- `docs/pr-template-model.md`
- `.github/workflows/guarded-autonomy-required-checks.yml`
- `.github/pull_request_template.md`
- `.github/ISSUE_TEMPLATE/spec-issue.md`

## Current Reading

E2E-02 now has recorded happy-path and boundary-path run evidence in-repo.

This still does not imply full repository completion.
Human closure judgment and the remaining matrix tracks are still required.
