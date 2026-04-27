# E2E-23 PR Body Guardrail Evidence

This document records concrete run evidence for the E2E-23 track.

## Scope

Issues:
- `#57`
- parent anchor: `#13`

Goal:
- confirm local helper tooling can render the required PR body evidence sections before a PR is opened or updated
- confirm local validation fails before `guarded-policy` is tripped
- confirm the remote Codex workflow uses the helper-generated PR body instead of ad hoc text

## Happy-path Run

Command:

```sh
node --test test/pr-body-guardrail.test.js test/remote-codex-workflow.test.js test/pr-template-model.test.js
```

Observed result on 2026-04-27:
- passed
- confirms the helper renders all required guarded-policy headings
- confirms the validator accepts a helper-rendered PR body
- confirms the remote Codex workflow uses the helper-generated `--body-file` path instead of handwritten body text
- confirms the canonical PR template model still matches the guarded-policy expectation

## Boundary-path Run

Command:

```sh
node --test test/pr-body-guardrail.test.js test/remote-codex-workflow.test.js test/pr-template-model.test.js
```

Observed result on 2026-04-27:
- passed
- confirms validation fails when required evidence markers are missing
- confirms the guardrail trips locally before the repository spends Actions time on the same missing-marker failure
- confirms the workflow path still preserves the required PR evidence structure after helper integration

## Evidence Files

- `scripts/render-pr-body.mjs`
- `scripts/validate-pr-body.mjs`
- `.github/workflows/remote-codex-executor.yml`
- `docs/pr-template-model.md`
- `test/pr-body-guardrail.test.js`
- `test/remote-codex-workflow.test.js`
- `test/pr-template-model.test.js`

## Current Reading

E2E-23 now has recorded happy-path and boundary-path run evidence in-repo.

This confirms Issue `#57` is connected to a local-first guardrail path that
prevents repeated PR body template CI failures before they become recurring
mail and Actions noise.
