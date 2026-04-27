# E2E-22 GitHub Read Plane Evidence

This document records concrete run evidence for the E2E-22 track.

## Scope

Issues:
- `#46`
- parent anchor: `#13`

Goal:
- confirm Butler can read GitHub runtime truth through VTDD for repositories, issues, reviews, review comments, checks, workflow runs, and branches
- confirm the read plane stays GitHub App-backed and short-lived
- confirm unsupported or underspecified reads are rejected instead of being narrated speculatively

## Happy-path Run

Command:

```sh
node --test test/github-read-plane.test.js test/worker.test.js test/custom-gpt-setup-docs.test.js
```

Observed result on 2026-04-27:
- passed
- confirms repository listing executes through the GitHub App-backed read plane
- confirms issue listing filters PR-shaped rows and returns Issue runtime truth
- confirms Butler-readable pull reviews, review comments, checks, workflow runs, and branch detail are returned through the same read plane
- confirms the Butler-facing Custom GPT artifacts expose the GitHub read route through the current action schema/docs

## Boundary-path Run

Command:

```sh
node --test test/github-read-plane.test.js test/worker.test.js test/custom-gpt-setup-docs.test.js
```

Observed result on 2026-04-27:
- passed
- confirms unsupported read resources are rejected with an explicit invalid request shape
- confirms missing required identifiers such as `pullNumber` are rejected instead of guessed
- confirms Butler-side read continuity does not rely on speculative narration when GitHub runtime truth is unavailable

## Evidence Files

- `src/core/github-read-plane.js`
- `src/worker.js`
- `docs/setup/custom-gpt-actions-openapi.yaml`
- `docs/setup/custom-gpt-actions-openapi.json`
- `docs/setup/custom-gpt-instructions.md`
- `test/github-read-plane.test.js`
- `test/worker.test.js`
- `test/custom-gpt-setup-docs.test.js`

## Current Reading

E2E-22 now has recorded happy-path and boundary-path run evidence in-repo.

This confirms Issue `#46` is connected to a Butler-readable GitHub runtime
truth path rather than remaining a narrow repository-candidate-only surface.
