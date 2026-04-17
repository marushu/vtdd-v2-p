# E2E-10 Surface and Role Separation Evidence

This document records concrete run evidence for the E2E-10 track.

## Scope

Issues:
- `#24`
- `#25`
- parent anchor: `#13`

Goal:
- confirm Butler / Executor / Reviewer boundaries are preserved across allowed operations
- confirm surface replacement does not redefine judgment model or approval boundaries
- confirm reviewer receives no execution authority

## Happy-path Run

Command:

```sh
node --test test/role-separation.test.js test/surface-independence.test.js test/core-policy.test.js
```

Observed result on 2026-04-17:
- passed
- confirms Butler / Executor / Reviewer responsibilities remain structurally separated
- confirms allowed surface usage preserves the canonical judgment model
- confirms role separation and surface independence docs remain aligned with policy behavior

## Boundary-path Run

Command:

```sh
node --test test/core-policy.test.js test/reviewer-registry.test.js test/surface-independence.test.js
```

Observed result on 2026-04-17:
- passed
- confirms reviewer has no execution authority
- confirms invalid role/surface combinations are rejected
- confirms judgment model override by surface is treated as a block rather than an allowed variation

## Evidence Files

- `test/core-policy.test.js`
- `test/reviewer-registry.test.js`
- `test/surface-independence.test.js`
- `test/role-separation.test.js`
- `docs/butler/role-separation.md`
- `docs/butler/surface-independence.md`
- `docs/butler/role.md`

## Current Reading

E2E-10 now has recorded happy-path and boundary-path run evidence in-repo.

This still does not imply full repository completion.
Human closure judgment and the remaining matrix tracks are still required.
