# E2E-17 GitHub App Secret Sync Bootstrap Evidence

This document records concrete run evidence for the E2E-17 track.

## Scope

Issues:
- `#15`
- parent anchor: `#13`

Goal:
- confirm an explicit operator bootstrap/update path exists for syncing GitHub App root material into GitHub Actions/runtime secrets
- confirm the canonical local bootstrap source is `~/.vtdd/credentials/manifest.json`
- confirm the path remains high-risk, approval-bound, and not a steady-state runtime dependency for normal iPhone-only operation

## Happy-path Run

Command:

```sh
node --test test/github-app-secret-sync.test.js test/passkey-operator-helper.test.js test/worker.test.js
```

Observed result on 2026-04-26:
- passed
- confirms the bootstrap source loads `appId`, `installationId`, private key, and gateway bearer token from the desktop bootstrap vault
- confirms the sync plan targets `VTDD_GITHUB_APP_ID` and `VTDD_GITHUB_APP_PRIVATE_KEY`
- confirms the explicit operator helper path preserves `issueNumber=15`, `repositoryInput`, and `approvalGrantId` into the secret-sync execution path
- confirms the Worker-hosted operator page can open the canonical approval flow for `highRiskKind=github_app_secret_sync`

## Boundary-path Run

Command:

```sh
node --test test/github-app-secret-sync.test.js test/passkey-operator-helper.test.js test/worker.test.js
```

Observed result on 2026-04-26:
- passed
- confirms secret sync approval validation rejects a grant whose `highRiskKind` is not `github_app_secret_sync`
- confirms execute mode requires a real `approvalGrantId`
- confirms execute mode requires machine auth via `--gateway-bearer-token`, `VTDD_GATEWAY_BEARER_TOKEN`, or the desktop bootstrap vault manifest
- confirms the path is bootstrap/update only and does not make `~/.vtdd/*` a steady-state dependency for normal iPhone-only VTDD operation

## Evidence Files

- `scripts/sync-github-app-actions-secrets.mjs`
- `src/core/github-app-secret-sync.js`
- `docs/setup/github-app-secret-sync.md`
- `test/github-app-secret-sync.test.js`
- `test/passkey-operator-helper.test.js`
- `test/worker.test.js`

## Current Reading

E2E-17 now has recorded happy-path and boundary-path run evidence in-repo.

This confirms Issue `#15` has an explicit operator bootstrap/update path for
GitHub App secret sync without treating the desktop bootstrap vault as a
steady-state runtime dependency.
