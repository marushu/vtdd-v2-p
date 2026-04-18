# Live Runtime Secret Readiness

## Goal

Record the current live runtime secret gap before iPhone manual testing starts.

This document belongs to Issue #171.

It is an audit of operator-managed runtime configuration, not a secret storage location.

## Current Reading

Current `main` is deployed to the live worker and the live runtime now exposes:

- `/health` with `mode: "v2"`
- `/setup/wizard` with current onboarding output
- `/v2/gateway` with fail-closed machine-auth behavior

This means code drift between repository and live worker is no longer the primary blocker.

The remaining blocker is runtime secret/config readiness.

## Confirmed Ready Inputs

GitHub Environment `production` currently has deploy workflow secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

These are sufficient for the governed deploy workflow itself.

## Confirmed Missing Worker Runtime Secrets

`wrangler secret list --env production` currently returns no worker secrets.

This means the live worker does not yet have the runtime secrets needed for protected setup and machine-auth execution.

The missing runtime secrets are:

- `SETUP_WIZARD_PASSCODE`
- `VTDD_GATEWAY_BEARER_TOKEN`
- `GITHUB_APP_ID`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_APP_PRIVATE_KEY`

## Effect Of Each Missing Secret

### `SETUP_WIZARD_PASSCODE`

Without this secret:

- `/setup/wizard` remains publicly viewable
- passcode boundary code exists but is inactive

### `VTDD_GATEWAY_BEARER_TOKEN`

Without this secret:

- `/v2/gateway` returns `503 unauthorized`
- `/v2/retrieve/*` remains unusable for Custom GPT / machine callers

This is expected fail-closed behavior, but it still blocks live usage.

### `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY`

Without these secrets:

- GitHub App setup check stays `not_configured`
- live repository index access is unavailable
- Butler cannot rely on GitHub App-backed runtime execution paths

## Live Manual Testing Reading

### Ready

- live deploy path
- current worker code on production
- setup wizard rendering
- fail-closed machine-auth boundary behavior

### Not Ready

- protected setup entry
- Custom GPT action execution through live gateway
- GitHub App-backed runtime behavior
- end-to-end iPhone manual testing of full VTDD flow

## Required Next Operator Actions

Minimum next operator actions are:

1. set `SETUP_WIZARD_PASSCODE` on Worker production env
2. set `VTDD_GATEWAY_BEARER_TOKEN` on Worker production env
3. set GitHub App secrets on Worker production env:
   - `GITHUB_APP_ID`
   - `GITHUB_APP_INSTALLATION_ID`
   - `GITHUB_APP_PRIVATE_KEY`
4. redeploy or restart the Worker
5. re-run live checks against:
   - `/setup/wizard`
   - `/v2/gateway`
   - GitHub App setup check

## Human Judgment Still Required

This document does not decide:

- what concrete passcode value to use
- what bearer token value to use
- whether setup wizard should later move from passcode boundary to Cloudflare Access OTP
- whether GitHub App should be recreated or existing bootstrap credentials reused

Those are still operator-owned runtime decisions.
