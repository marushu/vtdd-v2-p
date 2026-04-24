# GitHub App Secret Sync Bootstrap

This document is the canonical bootstrap contract for Issue #15.

## Purpose

VTDD already holds local GitHub App credential material under
`credentials/github-app/`, but runtime paths such as remote executor and Gemini
reviewer also require GitHub Actions secrets.

This bootstrap path exists to sync that local source of truth into GitHub
Actions secrets through an explicit operator action instead of ad hoc manual
copying.

## Source of Truth

The local source of truth is:

- `credentials/github-app/load-env.sh`
- the private key path referenced from that file

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

Then execute the local bootstrap with the returned `approvalGrantId`:

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

## Non-goals

- replacing the local GitHub App source of truth
- silent periodic sync
- weakening high-risk approval boundaries
- presenting the current phrase-based `passkey` gate as if it were already real
  WebAuthn
