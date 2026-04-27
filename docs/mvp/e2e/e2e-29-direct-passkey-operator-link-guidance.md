# E2E-29 Direct Passkey Operator Link Guidance

This document records concrete run evidence for the E2E-29 track.

## Scope

Issues:
- `#91`
- parent anchor: `#4`

Goal:
- confirm Butler self-parity can return a direct same-origin passkey operator URL for deploy recovery
- confirm the returned URL preserves the current Worker origin and deploy-scoped query params
- confirm Butler does not fabricate a deploy operator URL when runtime is already in sync

## Happy-path Run

Command:

```sh
node --test test/custom-gpt-setup-artifacts.test.js test/worker.test.js test/custom-gpt-setup-docs.test.js
```

Observed result on 2026-04-27:
- passed
- confirms deploy-stale self-parity includes `selfParity.deployRecovery.operatorUrl`
- confirms the URL uses the current Worker origin and includes `repositoryInput`, `actionType=deploy_production`, `highRiskKind=deploy_production`, and `issueNumber` when provided
- confirms Custom GPT instructions tell Butler to return that full absolute URL directly for iPhone/mobile use

## Boundary-path Run

Command:

```sh
node --test test/custom-gpt-setup-artifacts.test.js test/worker.test.js
```

Observed result on 2026-04-27:
- passed
- confirms `in_sync` self-parity returns no deploy recovery link
- confirms the guidance stays inside `GO + real passkey` and does not auto-execute deploy
- confirms unresolved repository still prevents safe operator-link generation

## Evidence Files

- `src/core/custom-gpt-setup-artifacts.js`
- `src/worker.js`
- `docs/setup/custom-gpt-instructions.md`
- `docs/security/webauthn-passkey-runtime.md`
- `test/custom-gpt-setup-artifacts.test.js`
- `test/worker.test.js`
- `test/custom-gpt-setup-docs.test.js`

## Current Reading

E2E-29 now has recorded happy-path and boundary-path run evidence in-repo.

This confirms Issue `#91` is connected to the last missing UX step for iPhone
deploy recovery: Butler can hand back the direct same-origin operator URL
instead of making the owner rebuild it by hand. It does not claim Butler can
open Safari itself, nor that deploy can proceed without `GO + real passkey`.
