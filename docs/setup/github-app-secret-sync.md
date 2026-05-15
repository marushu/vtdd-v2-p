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

Role-specific GitHub App sync is also supported for actor-separated VTDD
roles:

| Role | App ID secret | Private key secret |
| --- | --- | --- |
| `legacy` | `VTDD_GITHUB_APP_ID` | `VTDD_GITHUB_APP_PRIVATE_KEY` |
| `gemini-reviewer` | `VTDD_GEMINI_REVIEWER_APP_ID` | `VTDD_GEMINI_REVIEWER_APP_PRIVATE_KEY` |
| `codex-fallback-reviewer` | `VTDD_CODEX_FALLBACK_REVIEWER_APP_ID` | `VTDD_CODEX_FALLBACK_REVIEWER_APP_PRIVATE_KEY` |
| `mac-codex` | `VTDD_MAC_CODEX_APP_ID` | `VTDD_MAC_CODEX_APP_PRIVATE_KEY` |
| `vps-codex-cli` | `VTDD_VPS_CODEX_CLI_APP_ID` | `VTDD_VPS_CODEX_CLI_APP_PRIVATE_KEY` |

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

For a role-specific App private key that is not part of the legacy bootstrap
vault:

```bash
node scripts/sync-github-app-actions-secrets.mjs \
  --repo marushu/vtdd-v2-p \
  --app-role gemini-reviewer \
  --app-id 3706701 \
  --private-key-path /path/to/vtdd-gemini-reviewer.private-key.pem
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

Role-specific execution uses the same approval boundary:

```bash
node scripts/sync-github-app-actions-secrets.mjs \
  --repo marushu/vtdd-v2-p \
  --execute \
  --app-role gemini-reviewer \
  --app-id 3706701 \
  --private-key-path /path/to/vtdd-gemini-reviewer.private-key.pem \
  --runtime-url https://<your-runtime-host> \
  --approval-grant-id <approvalGrantId>
```

The script retrieves the approval grant from the worker runtime using machine
auth, verifies that:

- the grant is real and unexpired
- the grant scope matches the target repository
- `highRiskKind` is `github_app_secret_sync`

and only then performs GitHub Actions secret mutation.

During mutation, the script feeds each secret value to `gh secret set` through
explicit subprocess stdin and closes stdin immediately. If `gh secret set`
stops responding, the script terminates that subprocess after the configured
timeout instead of waiting forever. It first sends `SIGTERM`; if the process
does not exit after a short grace period, it escalates to `SIGKILL`.

Expected failure behavior:

- the failing GitHub Actions secret name is shown
- stdout/stderr byte counts may be shown for diagnostics
- secret values, private key contents, bearer tokens, and approval grant values
  are not printed
- a timeout means the local bootstrap/helper path needs maintenance before the
  operator retries

The default timeout is 30 seconds per secret. For diagnostics only, it can be
overridden with `--secret-set-timeout-ms <milliseconds>`.

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

For role-specific repair, start the helper with the role and key path it is
allowed to serve. The Worker operator page will include the role in the sync
request, and the helper refuses requests for a different role:

```bash
node scripts/run-passkey-operator-helper.mjs \
  --runtime-url https://<your-runtime-host> \
  --repo marushu/vtdd-v2-p \
  --issue-number 351 \
  --app-role gemini-reviewer \
  --app-id 3706701 \
  --private-key-path /path/to/vtdd-gemini-reviewer.private-key.pem
```

This helper:

- serves a local browser page for passkey registration and approval
- proxies the real `/v2/approval/passkey/*` runtime with machine auth
- executes `scripts/sync-github-app-actions-secrets.mjs` only after a real
  `approvalGrantId` has been issued
- executes `scripts/bootstrap-gateway-bearer-vault.mjs` through stdin when an
  operator explicitly pastes `VTDD_GATEWAY_BEARER_TOKEN` into the gateway vault
  section

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

The same `syncApiBase` bridge can bootstrap the local gateway bearer vault from
the Worker-hosted page. Use `actionType=destructive` and
`highRiskKind=gateway_bearer_vault_bootstrap`, paste the memo-app copy of
`VTDD_GATEWAY_BEARER_TOKEN` into `Gateway Bearer Vault`, and submit it through
the helper. The token must not be pasted into Butler chat, GitHub comments, RAG
memory, stdout, or stderr.

## Non-goals

- replacing the desktop bootstrap vault as the local GitHub App source of truth
- silent periodic sync
- weakening high-risk approval boundaries
- presenting the current phrase-based `passkey` gate as if it were already real
  WebAuthn
