# E2E-14 Setup Wizard Approval-Bound Path Evidence

This document records concrete run evidence for the current `#210` / `#207`
setup-wizard execution window.

## Scope

Issues:
- `#210`
- `#207`
- parent chain: `#182`

Goal:
- confirm the wizard exposes one real approval-bound happy path without manual
  ID/secret transport
- confirm Cloudflare prerequisite legibility remains user-facing rather than
  hidden as operator-only diagnostics
- confirm blocked or deferred setup states stay fail-closed and recover inside
  the same setup narrative

## Happy-path Run

Command:

```sh
node --test test/worker.test.js
```

Observed result on 2026-04-21:
- passed
- confirms setup wizard can record a `GO + passkey` request and carry it inside
  the same setup flow
- confirms detected or selected GitHub App installation binding can be stored on
  Worker runtime without manual ID transport between GitHub and Cloudflare
- confirms the bounded installation-binding consume path can immediately run
  live readiness proof in the same setup flow
- confirms success is reported in VTDD capability terms rather than as raw
  secret presence only

## Boundary-path Run

Command:

```sh
node --test test/worker.test.js test/setup-wizard-current-and-target-flow.test.js test/setup-wizard-approval-bound-automation-path.test.js
```

Observed result on 2026-04-21:
- passed
- confirms missing Cloudflare bootstrap prerequisites are surfaced as
  `blocked_by_operator_prerequisites`
- confirms missing current `GO + passkey` request blocks installation capture
  with fail-closed recovery guidance
- confirms deferred approval-bound issuance is reported as intentionally
  deferred rather than silently upgraded into broad bootstrap authority
- confirms current and target flow docs keep Cloudflare prerequisite debt and
  wizard-complete gaps explicit

## Evidence Files

- `src/worker.js`
- `docs/mvp/setup-wizard-current-and-target-flow.md`
- `docs/mvp/setup-wizard-approval-bound-runtime-checkpoint.md`
- `docs/security/setup-wizard-approval-bound-automation-path.md`
- `test/worker.test.js`
- `test/setup-wizard-current-and-target-flow.test.js`
- `test/setup-wizard-approval-bound-automation-path.test.js`

## Current Reading

E2E-14 now records one real approval-bound setup happy path and one fail-closed
boundary path for the current `#210` / `#207` window.

This does not yet prove wizard-complete setup.
Current repository reading remains `partial / in-progress` because:

- Cloudflare operator bootstrap recovery still remains setup debt
- approval-bound automation is still narrower than a general wizard-complete
  authority path
- setup completion must continue to be judged by mapped E2E evidence plus human
  closure review, not by the presence of one narrow success path alone
