# E2E-16 Worker Passkey Secret Sync Bridge Evidence

This document records concrete run evidence for the E2E-16 track.

## Scope

Issues:
- `#26`
- parent anchor: `#13`

Goal:
- confirm the Worker-hosted `VTDD Passkey Operator` section `3. GitHub App Secret Sync` is connected to the canonical desktop bootstrap/update bridge when an explicit bridge base is provided
- confirm the Worker page does not imply a Worker-only steady-state sync path when the desktop bridge is absent
- confirm the connected path preserves repository target and passkey approval-grant usage

## Happy-path Run

Command:

```sh
node --test test/passkey-operator-page.test.js test/passkey-operator-helper.test.js test/github-app-secret-sync.test.js test/worker.test.js
```

Observed result on 2026-04-26:
- passed
- confirms the Worker passkey operator page accepts `syncApiBase=http://127.0.0.1:8789/api`
- confirms section `3. GitHub App Secret Sync` targets `http://127.0.0.1:8789/api/github-app-secret-sync/execute`
- confirms the desktop helper bridge exposes CORS-safe `POST/OPTIONS` handling for the Worker-hosted page
- confirms the bridge path preserves `approvalGrantId` and `repositoryInput` into the local bootstrap/update execution path

## Boundary-path Run

Command:

```sh
node --test test/passkey-operator-page.test.js test/passkey-operator-helper.test.js test/github-app-secret-sync.test.js test/worker.test.js
```

Observed result on 2026-04-26:
- passed
- confirms the Worker page keeps section `3` disabled when no helper bridge is configured
- confirms the page surfaces `desktop maintenance required` instead of implying an enabled Worker-only sync path
- confirms the Worker runtime still does not read `~/.vtdd/*` directly

## Evidence Files

- `src/core/passkey-operator-page.js`
- `src/worker.js`
- `scripts/run-passkey-operator-helper.mjs`
- `docs/setup/github-app-secret-sync.md`
- `test/passkey-operator-page.test.js`
- `test/passkey-operator-helper.test.js`
- `test/github-app-secret-sync.test.js`
- `test/worker.test.js`

## Current Reading

E2E-16 now has recorded happy-path and boundary-path run evidence in-repo.

This confirms the Worker URL bridge is an explicit bootstrap/update/repair path.
It does not make the desktop vault a steady-state runtime dependency.
