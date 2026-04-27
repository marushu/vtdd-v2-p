# E2E-26 Governed Production Deploy From Passkey Operator

This document records concrete run evidence for the E2E-26 track.

## Scope

Issues:
- `#82`

Goal:
- confirm deploy stale can advance into a governed production deploy execution path from the Worker-owned passkey operator surface
- confirm the same-origin operator path preserves the current Worker origin as `runtime_url`
- confirm deploy remains blocked without a real deploy-scoped approval grant or deploy credentials

## Happy-path Run

Command:

```sh
node --test test/deploy-production-plane.test.js test/passkey-operator-page.test.js test/worker.test.js test/custom-gpt-setup-docs.test.js
```

Observed result on 2026-04-27:
- passed
- confirms the passkey operator page exposes a dedicated `Dispatch production deploy` action
- confirms same-origin browser POST to `/v2/action/deploy` succeeds when a real deploy-scoped `approvalGrantId` exists
- confirms the governed deploy dispatch uses the current Worker origin as `runtime_url`
- confirms Butler instructions point humans at the canonical same-origin operator helper path before claiming deploy can proceed

## Boundary-path Run

Command:

```sh
node --test test/deploy-production-plane.test.js test/worker.test.js
```

Observed result on 2026-04-27:
- passed
- confirms deploy is rejected when `GO` or a real deploy-scoped approval grant is missing
- confirms invalid grant scope is rejected instead of silently dispatching deploy
- confirms missing deploy credentials return the explicit `deploy_unavailable` category

## Evidence Files

- `src/worker.js`
- `src/core/deploy-production-plane.js`
- `src/core/passkey-operator-page.js`
- `docs/security/webauthn-passkey-runtime.md`
- `docs/setup/custom-gpt-instructions.md`
- `test/deploy-production-plane.test.js`
- `test/passkey-operator-page.test.js`
- `test/worker.test.js`
- `test/custom-gpt-setup-docs.test.js`

## Current Reading

E2E-26 now has recorded happy-path and boundary-path run evidence in-repo.

This confirms Issue `#82` is connected to a governed deploy execution path that
can be reached from the Worker-owned passkey operator surface on iPhone/mobile.
It does not claim that deploy can proceed without explicit human `GO + real
passkey`, nor that editor-side Custom GPT configuration can be auto-updated by
the same path.
