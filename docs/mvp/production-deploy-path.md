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
- `VTDD_GATEWAY_BEARER_TOKEN`

The token should be scoped to minimum required Worker deploy permissions.

These secrets are hard prerequisites. The workflow must check them before
validating the passkey grant or running tests so a missing deploy credential is
reported before operator approval time is wasted.

Use `docs/setup/cloudflare-deploy-secret-sync.md` as the canonical operator
sync path. Do not treat Worker runtime secrets as equivalent to GitHub Actions
secrets.

### 3. Worker Bindings

Production must bind the VTDD memory D1 database as `VTDD_MEMORY_D1`.

This binding is required for real passkey registration, approval challenge
persistence, and approval grant retrieval. A production deploy that drops this
binding breaks `GO + passkey` issuance and therefore blocks high-risk runtime
operations.

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
