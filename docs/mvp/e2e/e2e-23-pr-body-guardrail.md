# E2E-23 PR Body Guardrail Evidence

This document records concrete run evidence for the E2E-23 track.

## Scope

Issues:
- `#57`
- `#213`
- parent anchor: `#13`

Goal:
- confirm local helper tooling can render the required PR body evidence sections before a PR is opened or updated
- confirm local validation fails before `guarded-policy` is tripped
- confirm the remote Codex workflow uses the helper-generated PR body instead of ad hoc text
- confirm the VPS runner validates and normalizes malformed or missing PR body
  markers before PR create/update
- confirm PRs cannot omit the Butler Completion Contract or use placeholder
  values to claim completion without Butler-facing E2E evidence

## Happy-path Run

Command:

```sh
node --test test/pr-body-guardrail.test.js test/remote-codex-workflow.test.js test/pr-template-model.test.js
```

Observed result on 2026-04-27:
- passed
- confirms the helper renders all required guarded-policy headings
- confirms the validator accepts a helper-rendered PR body
- confirms the helper renders the Butler Completion Contract with explicit
  primary owner surface, fallback surface, owner goal, Butler entrypoint,
  Dashboard Butler natural-language path, Action Schema exposure, runtime path,
  runner/runtime truth, authority boundary, E2E evidence, and completion status
- confirms Dashboard Butler is the primary owner surface and Custom GPT can be
  named only as fallback compatibility in the Butler Completion Contract
- confirms the remote Codex workflow uses the helper-generated `--body-file` path instead of handwritten body text
- confirms the VPS runner open_pr path normalizes a malformed candidate PR
  body with `renderPrBody()` before PR creation
- confirms the canonical PR template model still matches the guarded-policy expectation

## Boundary-path Run

Command:

```sh
node --test test/pr-body-guardrail.test.js test/remote-codex-workflow.test.js test/pr-template-model.test.js
```

Observed result on 2026-04-27:
- passed
- confirms validation fails when required evidence markers are missing
- confirms validation fails when the Butler Completion Contract is missing
- confirms `Closes #...` PR bodies fail unless the Butler Completion Contract
  is `complete` and includes Butler-facing E2E evidence
- confirms validation fails when a PR body makes Custom GPT / Action Schema the
  primary owner-facing path instead of Dashboard Butler
- confirms the guardrail trips locally before the repository spends Actions time on the same missing-marker failure
- confirms the workflow path still preserves the required PR evidence structure after helper integration
- confirms existing PR body normalization is required because PR `#212`
  failed `guarded-autonomy-required-checks / guarded-policy` on
  2026-05-09 with a body that used `## Summary` / `## Validation` but
  omitted the required guarded-policy markers

## PR #212 Runtime Evidence

Observed with:

```sh
gh pr view 212 --repo marushu/vtdd-v2-p --json number,title,url,body,statusCheckRollup,headRefName,baseRefName
```

Observed result on 2026-05-09:
- PR: `https://github.com/marushu/vtdd-v2-p/pull/212`
- Head branch: `codex/issue-211`
- Failed check: `guarded-autonomy-required-checks / guarded-policy`
- Failed job URL: `https://github.com/marushu/vtdd-v2-p/actions/runs/25590261212/job/75126522802`
- The PR body contained `## Summary`, `## Validation`, and `## Notes`,
  but did not contain `## This PR satisfies Intent`,
  `## Satisfied Success Criteria`, `## Unsatisfied Success Criteria`,
  `## Verification Evidence`, or `## Surface Update Checklist`.

## Evidence Files

- `scripts/render-pr-body.mjs`
- `scripts/validate-pr-body.mjs`
- `scripts/run-vps-runner.mjs`
- `.github/workflows/remote-codex-executor.yml`
- `docs/pr-template-model.md`
- `test/pr-body-guardrail.test.js`
- `test/vps-runner-script.test.js`
- `test/remote-codex-workflow.test.js`
- `test/pr-template-model.test.js`

## Current Reading

E2E-23 now has recorded happy-path and boundary-path run evidence in-repo.

This confirms Issue `#57` is connected to a local-first guardrail path that
prevents repeated PR body template CI failures before they become recurring
mail and Actions noise.
