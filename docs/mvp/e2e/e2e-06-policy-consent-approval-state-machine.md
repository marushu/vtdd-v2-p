# E2E-06 Policy, Consent, Approval, and State Machine Evidence

This document records concrete run evidence for the E2E-06 track.

## Scope

Issues:
- `#8`
- `#9`
- `#10`
- `#12`
- parent anchor: `#13`

Goal:
- confirm valid execution proceeds only when deterministic policy, consent, approval, runtime truth, and workflow state all align
- confirm stale/conflicting/unauthorized paths are blocked
- confirm the worker-connected execution path reflects those boundaries

## Happy-path Run

Command:

```sh
node --test test/core-policy.test.js test/mvp-gateway.test.js test/workflow-state-machine.test.js test/worker.test.js
```

Observed result on 2026-04-17:
- passed
- confirms deterministic policy order allows execution only after earlier gates pass
- confirms consent and approval gates allow valid execution path when satisfied
- confirms workflow state machine follows the allowed forward path
- confirms worker-connected gateway path respects the same policy model

## Boundary-path Run

Command:

```sh
node --test test/core-policy.test.js test/runtime-truth-model.test.js test/state-machine-model.test.js test/worker.test.js
```

Observed result on 2026-04-17:
- passed
- confirms runtime stale/conflict paths are blocked
- confirms missing approval phrase or invalid approval scope is blocked
- confirms illegal or out-of-order workflow transitions are blocked
- confirms invalid policy input is rejected in worker path

## Evidence Files

- `test/core-policy.test.js`
- `test/mvp-gateway.test.js`
- `test/runtime-truth-model.test.js`
- `test/state-machine-model.test.js`
- `test/workflow-state-machine.test.js`
- `test/worker.test.js`
- `src/core/policy.js`
- `docs/security/consent-approval-model.md`
- `docs/runtime-truth-model.md`
- `docs/state-machine-model.md`

## Current Reading

E2E-06 now has recorded happy-path and boundary-path run evidence in-repo.

This still does not imply full repository completion.
Human closure judgment and the remaining matrix tracks are still required.
