# E2E-04 Retrieve Constitution and Cross-Issue Memory Evidence

This document records concrete run evidence for the E2E-04 track.

## Scope

Issues:
- `#5`
- `#19`
- parent anchor: `#13`

Goal:
- confirm constitution and cross-issue retrieval return structured references in the intended order
- confirm provider-unavailable path returns an explicit failure shape
- confirm worker-connected retrieve paths expose the same behavior

## Happy-path Run

Command:

```sh
node --test test/retrieval-contract.test.js test/cross-retrieval-runtime.test.js test/worker.test.js
```

Observed result on 2026-04-17:
- passed
- confirms retrieval contract preserves structured-first ordering
- confirms cross retrieval returns ordered references with issue-first priority in execution phase
- confirms worker retrieve endpoints return constitution and cross-issue references in the expected shapes

## Boundary-path Run

Command:

```sh
node --test test/cross-retrieval-runtime.test.js test/worker.test.js
```

Observed result on 2026-04-17:
- passed
- confirms provider-unavailable path returns explicit failure shape instead of silently succeeding
- confirms worker retrieve path returns a 503-style unavailable response when constitution provider is missing
- confirms semantic assistive path does not override structured-first ordering

## Evidence Files

- `test/retrieval-contract.test.js`
- `test/cross-retrieval-runtime.test.js`
- `test/worker.test.js`
- `src/core/retrieval-contract.js`
- `src/core/cross-retrieval-runtime.js`
- `src/worker.js`

## Current Reading

E2E-04 now has recorded happy-path and boundary-path run evidence in-repo.

This still does not imply full repository completion.
Human closure judgment and the remaining matrix tracks are still required.
