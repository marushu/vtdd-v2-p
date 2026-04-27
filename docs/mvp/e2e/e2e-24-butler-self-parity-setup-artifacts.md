# E2E-24 Butler Self-Parity Setup Artifact Evidence

This document records concrete run evidence for the E2E-24 track.

## Scope

Issues:
- `#70`
- parent anchor: `#13`

Goal:
- confirm Butler can retrieve canonical Custom GPT setup artifacts from the repository source of truth
- confirm Butler can compare repository canonical setup artifacts against deployed runtime actual capability
- confirm Butler can proactively use self-parity guidance to surface setup/deploy drift without speculative narration

## Happy-path Run

Command:

```sh
node --test test/custom-gpt-setup-artifacts.test.js test/custom-gpt-setup-docs.test.js test/worker.test.js
```

Observed result on 2026-04-27:
- passed
- confirms `/v2/retrieve/setup-artifact` returns canonical Custom GPT setup artifacts in copy-paste-friendly form
- confirms `/v2/retrieve/self-parity` returns a Butler-readable parity summary for repository canonical setup artifacts versus deployed runtime capability
- confirms the canonical Butler Instructions tell Butler to proactively run self-parity before significant VTDD work and when stale setup or deploy drift is suspected
- confirms the canonical setup artifacts include the new self-parity and setup-artifact retrieval routes

## Boundary-path Run

Command:

```sh
node --test test/custom-gpt-setup-artifacts.test.js test/custom-gpt-setup-docs.test.js test/worker.test.js
```

Observed result on 2026-04-27:
- passed
- confirms unsupported setup artifact requests are rejected with an explicit invalid request shape
- confirms self-parity reports `Cloudflare deploy update required` when canonical setup artifacts require runtime capability that the deployed runtime manifest does not yet advertise
- confirms Butler Instructions tell Butler not to overclaim editor-side parity just because runtime parity is in sync
- confirms failure handling stays in explicit categories such as setup artifact unavailable, `未検証`, or deploy/setup update required instead of speculative narration

## Evidence Files

- `src/core/custom-gpt-setup-artifacts.js`
- `src/worker.js`
- `docs/setup/custom-gpt-instructions.md`
- `docs/setup/custom-gpt-actions-openapi.yaml`
- `docs/setup/custom-gpt-actions-openapi.json`
- `test/custom-gpt-setup-artifacts.test.js`
- `test/custom-gpt-setup-docs.test.js`
- `test/worker.test.js`

## Current Reading

E2E-24 now has recorded happy-path and boundary-path run evidence in-repo.

This confirms Issue `#70` is connected to a Butler-readable self-parity path
for canonical setup artifact retrieval and deployed runtime drift detection.
It does not claim full Custom GPT editor-state introspection.
