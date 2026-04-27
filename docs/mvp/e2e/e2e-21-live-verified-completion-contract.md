# E2E-21 Live Verified Completion Contract Evidence

This document records concrete run evidence for the E2E-21 track.

## Scope

Issues:
- `#44`
- parent anchor: `#13`

Goal:
- confirm the canonical `live_verified` contract requires human-observable external evidence
- confirm completion claims do not collapse docs-only, code-only, and surface-connected states into "done"
- confirm the contract covers the key VTDD observable operations the owner actually relies on

## Happy-path Run

Command:

```sh
node --test test/live-verified-contract.test.js test/issue-to-e2e-matrix.test.js
```

Observed result on 2026-04-27:
- passed
- confirms the canonical contract defines `live_verified` as human-observable external evidence
- confirms the canonical status vocabulary includes `docs_only`, `code_only`, `surface_connected`, and `live_verified`
- confirms the contract covers repository listing, issue detail, PR update, reviewer comment arrival, Butler synthesis, merge, and issue close
- confirms the Issue-to-E2E matrix points repository completion at mapped E2E evidence plus human closure judgment rather than internal summaries

## Boundary-path Run

Command:

```sh
node --test test/live-verified-contract.test.js test/issue-to-e2e-matrix.test.js
```

Observed result on 2026-04-27:
- passed
- confirms a file existing in the repository is explicitly insufficient on its own
- confirms a Codex task summary and an internal runtime flag are explicitly insufficient on their own
- confirms a docs-only contract is explicitly insufficient on its own
- confirms repository status remains `partial` until mapped E2E evidence and human closure judgment exist across the active matrix

## Evidence Files

- `docs/mvp/live-verified-contract.md`
- `docs/mvp/issue-to-e2e-matrix.md`
- `test/live-verified-contract.test.js`
- `test/issue-to-e2e-matrix.test.js`

## Current Reading

E2E-21 now has recorded happy-path and boundary-path run evidence in-repo.

This confirms Issue `#44` is not just a prose definition; it is the canonical
completion contract used by the current VTDD matrix and status vocabulary.
