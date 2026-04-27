# E2E-20 GitHub Operation Plane Canonicalization Evidence

This document records concrete run evidence for the E2E-20 track.

## Scope

Issues:
- `#42`
- parent anchor: `#13`

Goal:
- confirm the canonical GitHub operation plane stays full-scope by default
- confirm approval tiers govern execution instead of silently narrowing capability
- confirm Butler-side authority boundaries remain connected to read, normal write, and high-risk GitHub paths

## Happy-path Run

Command:

```sh
node --test test/github-operation-plane.test.js test/github-read-plane.test.js test/github-write-plane.test.js test/github-high-risk-plane.test.js test/worker.test.js
```

Observed result on 2026-04-27:
- passed
- confirms the canonical operation-plane doc explicitly prohibits capability narrowing
- confirms the plane covers repositories, issues, pulls, reviews, checks, branches, merge, and bounded issue close
- confirms the runtime exposes connected read, normal write, and Butler-side high-risk GitHub paths rather than only a narrow convenience subset
- confirms GitHub App-backed execution remains the credential model across those planes

## Boundary-path Run

Command:

```sh
node --test test/github-operation-plane.test.js test/github-read-plane.test.js test/github-write-plane.test.js test/github-high-risk-plane.test.js test/worker.test.js
```

Observed result on 2026-04-27:
- passed
- confirms unsupported GitHub read requests are rejected instead of being narrated speculatively
- confirms high-risk operations such as merge are rejected from the normal write plane
- confirms merge and bounded issue close remain Butler-side authority actions gated by real approval grants
- confirms the canonical contract does not downgrade the GitHub capability model to only the currently exposed low-risk surface

## Evidence Files

- `docs/security/github-operation-plane.md`
- `src/core/github-read-plane.js`
- `src/core/github-write-plane.js`
- `src/core/github-high-risk-plane.js`
- `src/core/approval.js`
- `src/worker.js`
- `test/github-operation-plane.test.js`
- `test/github-read-plane.test.js`
- `test/github-write-plane.test.js`
- `test/github-high-risk-plane.test.js`
- `test/worker.test.js`

## Current Reading

E2E-20 now has recorded happy-path and boundary-path run evidence in-repo.

This confirms Issue `#42` is connected to the current read / `GO` / `GO + real
passkey` GitHub execution split without reinterpreting MVP as a smaller
capability subset.
