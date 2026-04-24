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
- `runtime_url=<user-owned worker runtime>`
- `approval_grant_id=<real passkey approval grant id>`
- environment approval on `production`

This encodes the MVP high-risk policy as:

1. explicit GO phrase
2. real WebAuthn/passkey approval grant validated against the worker runtime
3. protected environment confirmation

The workflow validates the grant through `/v2/retrieve/approval-grant` using
`VTDD_GATEWAY_BEARER_TOKEN`, and the grant scope must match:

- `actionType=deploy_production`
- `highRiskKind=deploy_production`
- `repositoryInput=<target repo>`

## Notes

- Branch restriction: deploy job runs only when ref is `main`
- Pre-deploy checks: approval grant validation and `npm test`
- Future hardening (out-of-scope for MVP): external passkey attestation service, staged rollout, rollback automation
