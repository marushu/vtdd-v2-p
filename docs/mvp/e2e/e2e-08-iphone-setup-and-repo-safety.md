# E2E-08 iPhone-first Setup and Repository Safety Evidence

This document records concrete run evidence for the E2E-08 track.

## Scope

Issues:
- `#21`
- `#39`
- `#41`
- parent anchor: `#13`

Goal:
- confirm the iPhone-first setup surface exposes the expected onboarding output
- confirm repository safety boundaries remain visible and enforced
- confirm boundary paths reject unsafe setup/execution assumptions

## Happy-path Run

Command:

```sh
node --test test/setup-wizard.test.js test/worker.test.js
```

Observed result on 2026-04-17:
- passed
- confirms setup wizard returns iPhone-first onboarding output
- confirms copy-ready construction text is present
- confirms schema import URL is present for Custom GPT action setup
- confirms machine-auth setting names are shown without exposing secret values
- confirms repository resolution safety contract is visible in setup output
- confirms HTML surface includes full Instructions replacement guidance

## Boundary-path Run

Command:

```sh
node --test test/butler-orchestrator.test.js test/worker.test.js
```

Observed result on 2026-04-17:
- passed
- confirms unresolved repository blocks execution
- confirms alias-resolved execute/destructive path still requires explicit confirmation
- confirms setup wizard does not expose secret credential input fields
- confirms ambiguous or unsafe execution paths are rejected in worker/butler paths

## Evidence Files

- `test/setup-wizard.test.js`
- `test/worker.test.js`
- `test/butler-orchestrator.test.js`
- `docs/mvp/iphone-first-setup.md`

## Current Reading

E2E-08 now has recorded happy-path and boundary-path run evidence in-repo.

This does not close the related issues by itself.
Human closure judgment and broader matrix completion are still required.
