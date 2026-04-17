# E2E-07 Butler Constitution-first Judgment Evidence

This document records concrete run evidence for the E2E-07 track.

## Scope

Issues:
- `#18`
- parent anchor: `#13`

Goal:
- confirm Butler judgment consults constitution and workflow order before actioning
- confirm invalid judgment order and unsupported surface overrides are blocked
- confirm the protocol remains visible in worker-connected paths as well as contract docs

## Happy-path Run

Command:

```sh
node --test test/butler-orchestrator.test.js test/butler-review-protocol.test.js test/worker.test.js
```

Observed result on 2026-04-17:
- passed
- confirms Butler path proceeds when constitution-first judgment order is satisfied
- confirms review protocol doc fixes the intended constitution-first ordering
- confirms worker-connected Butler path allows valid judgment flow

## Boundary-path Run

Command:

```sh
node --test test/butler-orchestrator.test.js test/worker.test.js
```

Observed result on 2026-04-17:
- passed
- confirms invalid judgment order is blocked
- confirms unsupported surface/judgment-model override is blocked
- confirms unresolved repository policy block propagates through Butler path

## Evidence Files

- `test/butler-orchestrator.test.js`
- `test/butler-review-protocol.test.js`
- `test/worker.test.js`
- `docs/butler/review-protocol.md`
- `src/core/butler-orchestrator.js`

## Current Reading

E2E-07 now has recorded happy-path and boundary-path run evidence in-repo.

This still does not imply full repository completion.
Human closure judgment and the remaining matrix tracks are still required.
