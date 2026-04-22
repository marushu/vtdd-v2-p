# Production Deploy Path (MVP)

This document defines the MVP deploy path:

- source control and trigger: GitHub Actions
- runtime target: Cloudflare Workers
- deploy command: `wrangler deploy --env production`

Status note:

- this is the current GitHub Actions centered MVP path
- deploy authority branching alternatives are tracked in
  `docs/mvp/deploy-authority-branching.md`

## Required GitHub Settings

### 1. Environment

Create GitHub Environment `production` and require human reviewers for it.

This is the mandatory human gate for high-risk `deploy_production`.

### 2. Secrets

Set repository or environment secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The token should be scoped to minimum required Worker deploy permissions.

## Approval Boundary (`GO + passkey`)

`deploy-production` workflow is manual (`workflow_dispatch`) and requires:

- `approval_phrase=GO`
- `passkey_verified=true`
- environment approval on `production`

This encodes the MVP high-risk policy as:

1. explicit GO phrase
2. passkey-verified operator intent
3. protected environment confirmation

## Notes

- Branch restriction: deploy job runs only when ref is `main`
- Pre-deploy check: `npm test` must pass
- Future hardening (out-of-scope for MVP): external passkey attestation service, staged rollout, rollback automation
