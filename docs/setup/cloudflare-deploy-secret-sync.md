# Cloudflare Deploy Secret Sync

This document defines the explicit operator bootstrap path for Issue #35.

## Problem

Cloudflare Worker secrets and GitHub Actions secrets are different runtime
surfaces.

Uploading `CLOUDFLARE_API_TOKEN` as a Worker secret does not make it available
to the GitHub Actions `deploy-production` workflow.

## Required Actions Secrets

Production deploy requires:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Canonical Sync Command

After creating a Cloudflare API token, sync it into GitHub Actions secrets with:

```bash
printf '%s' "$CLOUDFLARE_API_TOKEN" | node scripts/sync-cloudflare-actions-secrets.mjs \
  --repo marushu/vtdd-v2-p \
  --cloudflare-account-id "$CLOUDFLARE_ACCOUNT_ID" \
  --stdin \
  --runtime-url https://vtdd-v2-mvp.polished-tree-da7c.workers.dev \
  --approval-grant-id "$APPROVAL_GRANT_ID"
```

The script also accepts:

- `--cloudflare-api-token-path <path>`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The script must not print the token value.

## Approval Boundary

This is credential mutation.

It requires a real passkey approval grant with:

- `actionType=deploy_production`
- `highRiskKind=deploy_production`
- `repositoryInput=<target repo>`

## Non-goals

- creating a Cloudflare API token without an existing Cloudflare credential
- reading back an already-created Cloudflare token value
- production deploy itself
