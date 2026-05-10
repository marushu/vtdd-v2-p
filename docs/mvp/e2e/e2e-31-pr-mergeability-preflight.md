# E2E-31 PR Mergeability Preflight Evidence

This document records concrete run evidence for Issue #265.

## Scope

Issues:
- `#265`

Goal:
- confirm Butler can read PR mergeability runtime truth before merge
- confirm `pull_merge` performs a PR runtime-truth read before the merge API
- confirm conflict/dirty PR truth blocks before `PUT /merge` and returns a warning plus a fresh-branch suggestion

## Happy-path Run

Command:

```sh
node --test test/github-read-plane.test.js test/github-high-risk-plane.test.js test/worker.test.js
```

Observed result on 2026-05-11:
- passed
- confirms `vtddRetrieveGitHub(pulls)` exposes `mergeable`, `mergeableState`, `mergeConflict`, `mergeBlockedReason`, `mergeWarning`, `freshBranchSuggestion`, `conflictFiles`, `conflictFilesSource`, and nested `mergeability`
- confirms `pull_merge` performs `GET /pulls/{pull_number}` before `PUT /pulls/{pull_number}/merge`
- confirms a clean mergeability preflight proceeds to the merge API and then re-reads PR runtime truth after dispatch

## Boundary-path Run

Command:

```sh
node --test test/github-read-plane.test.js test/github-high-risk-plane.test.js test/worker.test.js
```

Observed result on 2026-05-11:
- passed
- confirms `mergeable:false` with `mergeable_state:"dirty"` is reported as conflict runtime truth
- confirms `pull_merge` returns `github_high_risk_preflight_blocked` before calling the merge API when conflict runtime truth is detected
- confirms conflict diagnostics include `pull_request_has_merge_conflicts`, a pre-merge warning, and a fresh-branch recreation suggestion
- confirms GitHub PR endpoint file-level conflict truth is not fabricated: `conflictFiles:null` and `conflictFilesSource:not_provided_by_github_pull_request_endpoint`

## Live Conflicting PR E2E Status

Live E2E against a real conflicting GitHub PR was not run in this revision.
Creating or mutating a live branch/PR fixture would be an external GitHub write
outside the explicit Issue #265 revision boundaries provided for PR #276.

This PR therefore must not claim that the live conflicting-PR path is verified.
The remaining reviewer risk is explicit: GitHub's live `mergeable` /
`mergeable_state` computation can still differ from local mocked runtime truth
until a human-approved live conflict fixture is exercised.

Read-only live verification harness:

```sh
LIVE_GITHUB_REPOSITORY=owner/repo \
LIVE_GITHUB_CONFLICT_PULL_NUMBER=123 \
GITHUB_APP_INSTALLATION_TOKEN=ghs_... \
node --test test/e2e-31-live-pr-mergeability-preflight.test.js
```

The harness only performs `GET /repos/{owner}/{repo}/pulls/{pull_number}`
through `vtddRetrieveGitHub(pulls)`. It does not create branches, update PRs,
call `PUT /merge`, deploy, mutate credentials, or change repository settings.
It is skipped by default until a human supplies an existing conflicting PR
fixture and a read-scoped GitHub App installation token.

## Evidence Files

- `src/core/github-mergeability.js`
- `src/core/github-read-plane.js`
- `src/core/github-high-risk-plane.js`
- `src/worker.js`
- `test/github-read-plane.test.js`
- `test/github-high-risk-plane.test.js`
- `test/worker.test.js`
- `test/e2e-31-live-pr-mergeability-preflight.test.js`

## Current Reading

Issue #265 has connected runtime code and passing local happy/boundary evidence.
Closure remains blocked on human judgment and, if required by the reviewer,
a separately approved live conflicting-PR E2E run. This revision adds the
read-only harness for that run but does not replace the missing live evidence.
