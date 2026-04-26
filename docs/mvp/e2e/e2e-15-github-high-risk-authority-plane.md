# E2E-15 GitHub High-Risk Authority Plane Evidence

This document records concrete run evidence for the E2E-15 track.

## Scope

Issues:
- `#55`
- parent anchor: `#13`

Goal:
- confirm the Butler-side GitHub high-risk authority plane executes bounded merge and bounded issue close only with scoped `GO + real passkey`
- confirm the path stays GitHub App-backed and short-lived
- confirm blocked paths do not silently mutate GitHub state

## Happy-path Run

Command:

```sh
node --test test/github-high-risk-plane.test.js test/worker.test.js test/custom-gpt-setup-docs.test.js
```

Observed result on 2026-04-26:
- passed
- confirms `pull_merge` executes through `/v2/action/github-authority`
- confirms merge requires a real approval grant resolved from passkey memory, not chat phrase substitution alone
- confirms the authority response includes GitHub-visible merge state such as `merged: true`, merge `sha`, and `htmlUrl`
- confirms bounded `issue_close` only proceeds after merged pull verification and returns the closed issue `htmlUrl`

## Boundary-path Run

Command:

```sh
node --test test/github-high-risk-plane.test.js test/worker.test.js test/custom-gpt-setup-docs.test.js
```

Observed result on 2026-04-26:
- passed
- confirms missing real approval grant is rejected by the high-risk plane
- confirms bounded issue close is rejected with `bounded issue close requires a merged pull request` when merged pull proof is absent
- confirms merge and issue close remain outside the normal write plane and are not silently downgraded to `GO`-only execution

## Evidence Files

- `src/core/github-high-risk-plane.js`
- `src/core/approval.js`
- `src/worker.js`
- `docs/setup/custom-gpt-actions-openapi.yaml`
- `docs/setup/custom-gpt-actions-openapi.json`
- `docs/setup/custom-gpt-instructions.md`
- `test/github-high-risk-plane.test.js`
- `test/worker.test.js`
- `test/custom-gpt-setup-docs.test.js`

## Current Reading

E2E-15 now has recorded happy-path and boundary-path run evidence in-repo.

This still does not imply repository completion or authorize broader destructive
GitHub mutation. Secret/settings/deploy paths remain separate high-risk work.
