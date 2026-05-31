# Desktop Bootstrap Credential Vault

This document is the canonical desktop bootstrap contract for Issue #43.

## Purpose

VTDD needs an operator-owned local credential root that:

- lives outside the repository
- is used for initial bootstrap and later update/repair work
- does not store short-lived execution tokens
- can degrade cleanly into `desktop maintenance required` when iPhone-only
  operation cannot continue

This vault is not the steady-state operational source for normal VTDD runtime.
Steady-state operation is expected to use already-synced Worker/runtime secrets
and minted short-lived execution tokens.

The canonical local path is:

- `~/.vtdd/credentials/manifest.json`

For the gateway bearer token specifically, use the repository bootstrap helper
instead of pasting the token into chat or a command argument:

```bash
printf '%s' "$VTDD_GATEWAY_BEARER_TOKEN" | node scripts/bootstrap-gateway-bearer-vault.mjs \
  --token-stdin \
  --pretty
```

The helper writes `gateway/bearer-token.txt`, updates
`~/.vtdd/credentials/manifest.json`, keeps the token value out of stdout, and
uses operator-only file modes where the filesystem supports them. `--generate`
can create a new local token, but that token will not work against the deployed
Worker until the Worker secret and Custom GPT Action auth are intentionally
rotated through their own approval boundaries.

## Boundary

This vault is:

- local-only
- operator-owned
- not repository-tracked
- not D1-backed
- not a setup wizard revival
- not a steady-state runtime dependency

Short-lived execution credentials must not be stored here.

That includes:

- GitHub App JWTs
- GitHub installation tokens
- one-shot execution tokens
- other derived runtime tokens intended to be minted and discarded

## Layout

Recommended layout:

```text
~/.vtdd/
  credentials/
    manifest.json
    github-app/
      private-key.pem
    github-apps/
      codex-fallback-reviewer.pem
      vps-codex-cli.pem
    cloudflare/
      api-token.txt
    gateway/
      bearer-token.txt
    reviewer/
      gemini-api-key.txt
```

## Manifest Schema

`manifest.json` stores references and metadata, not one giant inline secret blob.

Example:

```json
{
  "version": 1,
  "githubApp": {
    "appId": "3467409",
    "installationId": "126180737",
    "privateKeyPath": "github-app/private-key.pem"
  },
  "githubAppRoles": {
    "codex-fallback-reviewer": {
      "appId": "3706921",
      "installationId": "132169447",
      "privateKeyPath": "github-apps/codex-fallback-reviewer.pem"
    },
    "vps-codex-cli": {
      "appId": "your-vps-codex-cli-app-id",
      "installationId": "your-vps-codex-cli-installation-id",
      "privateKeyPath": "github-apps/vps-codex-cli.pem"
    }
  },
  "cloudflare": {
    "accountId": "your-cloudflare-account-id",
    "apiTokenPath": "cloudflare/api-token.txt"
  },
  "gateway": {
    "bearerTokenPath": "gateway/bearer-token.txt",
    "runtimeUrl": "https://your-worker.example.workers.dev"
  },
  "reviewer": {
    "geminiApiKeyPath": "reviewer/gemini-api-key.txt"
  }
}
```

Relative paths are resolved from `~/.vtdd/credentials/`.

## Required Coverage

At minimum, the vault contract covers:

- GitHub App root material
  - `appId`
  - `installationId`
  - private key path
- role-specific GitHub App material for local/VPS repair paths
  - `githubAppRoles.codex-fallback-reviewer`
  - `githubAppRoles.vps-codex-cli`
  - each role stores `appId`, `installationId`, and a private key path
- Cloudflare root material
  - `accountId`
  - API token path
- VTDD gateway bearer token path
- VTDD runtime URL for VPS runner Dashboard event delivery, when the runner
  cannot receive `VTDD_RUNTIME_URL` from its service environment
- reviewer credential path(s), if configured

## Operational Model

The canonical model is:

- `~/.vtdd/*` is used during initial bootstrap
- `~/.vtdd/*` is used again only when update, rotation, or repair requires
  operator-owned root credential material
- steady-state VTDD operation should not require the local desktop vault to be
  mounted or reachable
- normal Butler / Worker execution should rely on Worker/runtime secrets plus
  short-lived derived tokens instead

## Security Rules

- no secret values are committed to the repository
- VTDD runtime must not log secret contents
- file permissions should remain operator-only where possible
- D1 stores audit / scope / metadata only, not root secret values
- this vault is for root credential references and local secret files, not for
  short-lived execution tokens

## Desktop Maintenance Required

When VTDD is operating from an iPhone-only or otherwise non-desktop surface and
update/rotation/repair cannot continue without operator-owned root credential
material, Butler must stop and surface:

- `desktop maintenance required`

The response should also include a concrete reason such as:

- `github_app_private_key_invalid`
- `cloudflare_api_token_invalid`
- `gateway_bearer_token_missing`
- `reviewer_api_key_invalid`

This state is expected only when bootstrap/update/repair work is needed.
It must not be treated as the normal steady-state requirement for everyday VTDD
operation.

## Non-goals

- setup wizard resurrection
- storing short-lived execution tokens in D1
- repository-tracked secret values
- full encryption / KMS rollout in the same issue
- making the local desktop vault a mandatory dependency for steady-state
  iPhone-only operation
