# E2E-418: setup / Action Schema / deploy diagnostics

This document records evidence for Issue #418.

## Scope

Issue:
- Issue #418

Goal:
- let the owner diagnose broken Butler setup from iPhone/iPad without opening mac Codex
- classify root-cause candidates across Custom GPT Action Schema, Custom GPT Instructions, Action Authentication, Cloudflare deploy/runtime, and unreadable Custom GPT editor state
- keep the diagnostic path read-only and secret-free

## Happy-path Run

Command:

```sh
node --test test/custom-gpt-setup-artifacts.test.js test/custom-gpt-setup-docs.test.js test/worker.test.js
```

Observed result on 2026-05-18:
- passed
- confirms `/setup/diagnostics` opens without Action auth as a browser-direct recovery surface
- confirms `/v2/retrieve/setup-diagnostics` is exposed in the canonical Action Schema
- confirms diagnostics includes Action Schema checks for `GatewayBearerAuth`, `responseMode=action_visible`, setup artifact/self-parity/setup-diagnostics operationIds, `build` under `vtddExecute`, and server URL alignment
- confirms diagnostics does not expose GitHub App tokens or approval grants

## Boundary-path Run

Command:

```sh
node --test test/custom-gpt-setup-artifacts.test.js test/worker.test.js
```

Observed result on 2026-05-18:
- passed
- confirms observed `ClientResponseError` with HTTP 401 is classified as `action_auth_bearer_missing_or_unverified`
- confirms missing canonical Action Schema capability is classified as `custom_gpt_action_schema_update_required`
- confirms repo/runtime manifest drift is classified as `cloudflare_deploy_update_required`
- confirms Custom GPT editor state is reported as `editor_state_unreadable` instead of claiming editor parity from runtime parity alone

## Evidence Files

- `src/core/custom-gpt-setup-artifacts.js`
- `src/worker/runtime.js`
- `src/core/help-guide-page.js`
- `docs/setup/custom-gpt-actions-openapi.yaml`
- `docs/setup/custom-gpt-actions-openapi.json`
- `docs/setup/custom-gpt-instructions.md`
- `docs/setup/custom-gpt-instructions-short.md`
- `docs/setup/custom-gpt-instructions-short-min.md`
- `test/custom-gpt-setup-artifacts.test.js`
- `test/custom-gpt-setup-docs.test.js`
- `test/worker.test.js`

## Current Reading

Issue #418 is connected to a read-only Butler-facing retrieve action and a browser-direct recovery page. This is setup/deploy diagnostics evidence only. It does not execute Cloudflare deploy, mutate credentials, or prove the current Custom GPT editor contents were updated, because the editor state is not externally readable.
