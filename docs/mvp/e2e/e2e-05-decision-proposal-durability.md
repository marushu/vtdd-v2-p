# E2E-05 Decision and Proposal Durability Evidence

This document records concrete run evidence for the E2E-05 track.

## Scope

Issues:
- `#17`
- `#20`
- parent anchor: `#13`

Goal:
- confirm gateway persists decision and proposal records in the intended structured form
- confirm retrieve paths return those references after persistence
- confirm invalid schema or missing provider blocks persistence

## Happy-path Run

Command:

```sh
node --test test/decision-log.test.js test/proposal-log.test.js test/worker.test.js
```

Observed result on 2026-04-17:
- passed
- confirms gateway persists decision log entries and returns decision references
- confirms gateway persists proposal log entries and returns proposal references
- confirms retrieve endpoints return those references after persistence

## Boundary-path Run

Command:

```sh
node --test test/decision-log.test.js test/proposal-log.test.js test/worker.test.js
```

Observed result on 2026-04-17:
- passed
- confirms invalid decision/proposal schema is blocked
- confirms missing memory provider blocks persistence instead of silently accepting writes
- confirms durability path preserves canonical field requirements

## Evidence Files

- `test/decision-log.test.js`
- `test/proposal-log.test.js`
- `test/worker.test.js`
- `docs/decision-log-model.md`
- `docs/proposal-log-model.md`
- `src/worker.js`

## Current Reading

E2E-05 now has recorded happy-path and boundary-path run evidence in-repo.

This still does not imply full repository completion.
Human closure judgment and the remaining matrix tracks are still required.
