# spec: Setup Wizard URL Endpoint (iPhone-accessible)

## Intent

Provide a URL-first setup entrypoint so users can open the Worker endpoint from iPhone and retrieve onboarding pack output without local Mac tooling.

## Background

`runInitialSetupWizard` exists in core, but users currently need local execution context to call it.
For mobile-first onboarding, the wizard output should be obtainable from a web endpoint.

## Scope

- add `GET /setup/wizard` endpoint on Worker
- return human-readable HTML for iPhone copy/paste flow
- support JSON mode for automation (`?format=json`)
- generate safe default answers (no secret fields)
- expose Construction text and Action schema from onboarding pack

## Success Criteria

- opening `/setup/wizard` on iPhone shows setup output
- output includes Custom GPT construction text and action schema
- endpoint never asks for secret credentials
- endpoint uses iPhone-first setup mode and no-default-repo policy

## Non-goal

- authenticated per-user setup portal
- passkey attestation service
- automatic write to DB or Git from endpoint
