# WebAuthn Passkey Runtime

This document defines the executable runtime path introduced for Issue #14.

## Current Reality

The repository historically used `GO + passkey` language while runtime policy
only received a phrase-bound `passkey: true/false` flag.

That temporary phrase gate is not a real passkey ceremony.

## Runtime Goal

High-risk operations must be unlocked through a real WebAuthn/passkey
challenge, verified by the worker runtime, and converted into a short-lived
approval grant that Butler can use on the next high-risk request.

## Current Endpoints

- `POST /v2/approval/passkey/register/options`
- `POST /v2/approval/passkey/register/verify`
- `POST /v2/approval/passkey/challenge`
- `POST /v2/approval/passkey/verify`
- `GET /v2/retrieve/approval-grant?approvalId=...`
- `GET /v2/approval/passkey/operator`

Current boundary:

- `/v2/retrieve/approval-grant` stays machine-auth only
- `GET /v2/approval/passkey/operator` is the human/browser surface on the
  user-owned Worker URL
- same-origin browser POSTs to the passkey routes are allowed so the Worker URL
  can execute the ceremony directly
- browser bootstrap registration is allowed only while no passkey has been
  registered yet
- later registration expansion needs a separate bounded Issue; this slice does
  not open public multi-enrollment forever

## Runtime Shape

### 1. Register passkey

The worker generates registration options, verifies the browser response, and
stores the resulting passkey material as a non-secret registry record.

### 2. Request high-risk approval

Butler/runtime asks the worker for a passkey approval challenge with the
intended target scope:

- `actionType`
- `repositoryInput`
- `issueNumber`
- `relatedIssue`
- `phase`

For example:

- GitHub App secret sync -> `actionType=destructive`, `highRiskKind=github_app_secret_sync`
- production deploy -> `actionType=deploy_production`, `highRiskKind=deploy_production`

### 3. Verify WebAuthn response

The worker verifies the authenticator response and writes an `approval_log`
grant with:

- `approvalId`
- `verifiedAt`
- `expiresAt`
- scope snapshot

### 4. Execute high-risk action

The caller sends `approvalGrantId` on the next `/v2/gateway` high-risk request.
The worker resolves that grant from memory and binds it back into policy
evaluation.

For local operator bootstrap flows, the local runtime may also retrieve the
grant through `/v2/retrieve/approval-grant` and validate a scoped
`highRiskKind` before mutating external high-risk surfaces such as GitHub
Actions secrets.

### 5. Operator helper page

`/v2/approval/passkey/operator` returns a same-origin HTML helper on the
Worker URL itself. It can:

- register a passkey
- request a high-risk approval challenge
- verify the authenticator response
- display the resulting `approvalGrantId`
- dispatch a governed production deploy after a deploy-scoped
  `approvalGrantId` has been issued

This is the minimum browser/iPhone execution surface for the real passkey flow.
The Worker URL is canonical. Local helper/proxy paths are not the canonical
surface for shared/public use.

## Record Retention

The worker persists four kinds of passkey-related records:

- passkey registry records: durable until explicit revoke/removal
- registration sessions: short-lived and cleanup-eligible
- approval sessions: short-lived and cleanup-eligible
- approval grants: short-lived and cleanup-eligible

Expired session/grant records must be purged by the runtime so D1 does not
accumulate passkey ceremony garbage indefinitely.

## Safety Notes

- phrase-only `passkey=true` is a temporary compatibility path, not the final
  security model
- high-risk grant expiry is short-lived by design
- grant scope must match the current target
- reviewer never receives execution credentials or passkey registry material
- operator page must not hard-code owner-specific runtime URLs

## Non-goals of This Slice

- full Butler browser-return UX
- passkey autofill UI
- production-grade operator enrollment UX
- replacing the existing `GO` requirement
