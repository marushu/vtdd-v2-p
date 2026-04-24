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

All four routes use the same machine-auth boundary as the other `/v2/*`
endpoints.

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

## Safety Notes

- phrase-only `passkey=true` is a temporary compatibility path, not the final
  security model
- high-risk grant expiry is short-lived by design
- grant scope must match the current target
- reviewer never receives execution credentials or passkey registry material

## Non-goals of This Slice

- full Butler browser-return UX
- passkey autofill UI
- production-grade operator enrollment UX
- replacing the existing `GO` requirement
