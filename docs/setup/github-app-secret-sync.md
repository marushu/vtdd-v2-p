# GitHub App Secret Sync Bootstrap

This document is the canonical bootstrap contract for Issue #15 and Issue #43.

## Purpose

VTDD keeps local GitHub App root material in the operator-owned desktop
bootstrap vault under `~/.vtdd/credentials/`, but steady-state runtime paths
such as remote executor and reviewer flows are expected to use already-synced
runtime secrets instead of reading the local vault directly.

This bootstrap path exists to sync that local source of truth into GitHub
Actions/runtime secrets through an explicit operator action instead of ad hoc
manual copying.

## Source of Truth

The local bootstrap/update source of truth is:

- `~/.vtdd/credentials/manifest.json`
- the private key path referenced from that manifest

The sync target is GitHub Actions secrets:

- `VTDD_GITHUB_APP_ID`
- `VTDD_GITHUB_APP_PRIVATE_KEY`

## Boundary

This is a high-risk operation because it mutates repository secrets.

- it is not background automation
- it is not normal Butler runtime
- it must remain an explicit operator bootstrap step
- it follows the current `GO + passkey` high-risk boundary

## Dry-run First

Review the planned sync without mutation:

```bash
node scripts/sync-github-app-actions-secrets.mjs --repo marushu/vtdd-v2-p
```

## Execute

Perform the sync only after a real passkey approval grant has been issued by
the worker runtime for this exact high-risk operation.

The approval challenge should be requested with a scope that includes:

- `repositoryInput=<target repo>`
- `highRiskKind=github_app_secret_sync`

Then execute the local bootstrap/update path with the returned
`approvalGrantId`:

```bash
node scripts/sync-github-app-actions-secrets.mjs \
  --repo marushu/vtdd-v2-p \
  --execute \
  --runtime-url https://<your-runtime-host> \
  --approval-grant-id <approvalGrantId>
```

The script retrieves the approval grant from the worker runtime using machine
auth, verifies that:

- the grant is real and unexpired
- the grant scope matches the target repository
- `highRiskKind` is `github_app_secret_sync`

and only then performs GitHub Actions secret mutation.

By default, the script reads:

- `~/.vtdd/credentials/manifest.json`

Use `--manifest-path <path>` only if you intentionally keep the operator-owned
desktop bootstrap vault somewhere else.

## Optional Operator Helper

For explicit operator execution without manual API calls, use the local helper:

```bash
node scripts/run-passkey-operator-helper.mjs \
  --runtime-url https://<your-runtime-host> \
  --repo marushu/vtdd-v2-p \
  --issue-number 15
```

This helper:

- serves a local browser page for passkey registration and approval
- proxies the real `/v2/approval/passkey/*` runtime with machine auth
- executes `scripts/sync-github-app-actions-secrets.mjs` only after a real
  `approvalGrantId` has been issued

It is an explicit operator helper for bootstrap/update/repair, not a setup
wizard, not a background sync path, and not a steady-state runtime dependency.

Steady-state iPhone-only VTDD operation is expected to continue without
`~/.vtdd/*` until a bootstrap/update/repair event is required.

## Worker URL Bridge

The canonical passkey ceremony surface remains the Worker URL:

- `GET /v2/approval/passkey/operator`

When you want section `3. GitHub App Secret Sync` on that Worker-hosted page to
execute the real desktop bootstrap path, first start the local helper and then
open the Worker URL with an explicit desktop bridge base:

```text
https://<your-runtime-host>/v2/approval/passkey/operator?repositoryInput=<owner/repo>&issueNumber=15&highRiskKind=github_app_secret_sync&syncApiBase=http%3A%2F%2F127.0.0.1%3A8789%2Fapi
```

Current contract:

- if `syncApiBase` points at a running desktop helper bridge, section `3`
  executes the real local bootstrap path
- if `syncApiBase` is absent or invalid, the Worker page must surface
  `desktop maintenance required` and keep the sync action disabled
- the Worker runtime does not read `~/.vtdd` directly
- the desktop helper remains the only component that reads the local bootstrap
  vault and executes the GitHub Actions secret mutation path

## Non-goals

- replacing the desktop bootstrap vault as the local GitHub App source of truth
- silent periodic sync
- weakening high-risk approval boundaries
- presenting the current phrase-based `passkey` gate as if it were already real
  WebAuthn
