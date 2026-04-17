# Issue-to-E2E Matrix

This document is the canonical tracking matrix for Issue #54.

Repository status must be treated as partial until every listed E2E scenario has:

- implementation evidence in repo
- test evidence
- mapped happy-path result
- mapped boundary/failure-path result
- human approval for closure when applicable

Status values used below:

- `implemented_pending_e2e`: code and tests exist, but mapped E2E evidence is still pending
- `partial`: some supporting code/docs exist, but the full issue intent is not yet evidenced end to end
- `pending`: implementation and/or evidence is still missing

## E2E-00 Parent execution anchor readiness

- Issues: `#13`
- Happy path:
  - parent issue functions as the MVP execution anchor and points readers to current docs/matrix instead of stale planning state
- Boundary path:
  - parent issue is not misread as completed while repository status remains partial
- Implementation evidence:
  - `docs/mvp/issue-13-rewrite-draft.md`
  - `docs/mvp/bootstrap-plan.md`
  - `docs/mvp/next-step-handoff.md`
- Test evidence:
  - `test/bootstrap-plan-current-state.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-13-parent-readiness.md`
- Status: `implemented_pending_e2e`

## E2E-01 Canonical docs + reference integrity

- Issues: `#1 #7 #13 #51`
- Happy path:
  - canonical docs resolve from parent issue references and required schema/rule ids match docs and tests
- Boundary path:
  - missing canonical rule/doc reference is detected and treated as blocking
- Implementation evidence:
  - `docs/constitution/core.md`
  - `docs/constitution/rules.md`
  - `docs/constitution/schema.json`
  - `docs/mvp/issue-13-rewrite-draft.md`
- Test evidence:
  - `test/constitution-schema.test.js`
  - `test/canonical-docs-restoration.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-01-canonical-docs-reference-integrity.md`
- Status: `implemented_pending_e2e`

## E2E-02 Issue/PR template discipline

- Issues: `#14 #15 #16`
- Happy path:
  - issue and PR artifacts contain required intent/success/non-goal/verification sections
- Boundary path:
  - missing required PR evidence markers are rejected by required checks
- Implementation evidence:
  - `docs/issue-as-spec-model.md`
  - `docs/issue-template-model.md`
  - `docs/pr-template-model.md`
  - `.github/workflows/guarded-autonomy-required-checks.yml`
- Test evidence:
  - `test/issue-template-model.test.js`
  - `test/pr-template-model.test.js`
  - `test/guarded-semi-automation-mode.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-02-issue-pr-template-discipline.md`
- Status: `implemented_pending_e2e`

## E2E-03 Memory schema/provider contract

- Issues: `#2 #3 #4`
- Happy path:
  - canonical memory record validates and provider stores/reads via Cloudflare adapter contract
- Boundary path:
  - malformed schema or missing provider method is rejected
- Implementation evidence:
  - `docs/memory-schema.md`
  - `docs/memory-provider.md`
  - `src/core/cloudflare-provider.js`
- Test evidence:
  - `test/memory-provider.test.js`
  - `test/cloudflare-provider.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-03-memory-schema-and-provider-contract.md`
- Status: `implemented_pending_e2e`

## E2E-04 Retrieve constitution/cross-issue memory

- Issues: `#5 #19`
- Happy path:
  - retrieve endpoints return constitution and cross-issue references in structured-first order
- Boundary path:
  - provider unavailable path returns an explicit failure shape
- Implementation evidence:
  - `src/core/retrieval-contract.js`
  - `src/core/cross-retrieval-runtime.js`
  - `src/worker.js`
- Test evidence:
  - `test/retrieval-contract.test.js`
  - `test/cross-retrieval-runtime.test.js`
  - `test/worker.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-04-retrieve-constitution-and-cross-memory.md`
- Status: `implemented_pending_e2e`

## E2E-05 Decision/proposal durability

- Issues: `#17 #20`
- Happy path:
  - gateway persists decision/proposal logs and retrieve endpoints return references
- Boundary path:
  - invalid schema or missing memory provider blocks persistence
- Implementation evidence:
  - `docs/decision-log-model.md`
  - `docs/proposal-log-model.md`
  - `src/worker.js`
- Test evidence:
  - `test/decision-log.test.js`
  - `test/proposal-log.test.js`
  - `test/worker.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-05-decision-proposal-durability.md`
- Status: `implemented_pending_e2e`

## E2E-06 Policy/consent/approval/state machine

- Issues: `#8 #9 #10 #12`
- Happy path:
  - valid execution proceeds only after deterministic policy, consent, approval, and state transitions align
- Boundary path:
  - runtime stale/conflict, missing approval phrase, or illegal transition is blocked
- Implementation evidence:
  - `src/core/policy.js`
  - `docs/security/consent-approval-model.md`
  - `docs/runtime-truth-model.md`
  - `docs/state-machine-model.md`
- Test evidence:
  - `test/core-policy.test.js`
  - `test/mvp-gateway.test.js`
  - `test/runtime-truth-model.test.js`
  - `test/state-machine-model.test.js`
  - `test/workflow-state-machine.test.js`
  - `test/worker.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-06-policy-consent-approval-state-machine.md`
- Status: `implemented_pending_e2e`

## E2E-07 Butler constitution-first judgment protocol

- Issues: `#18`
- Happy path:
  - butler judgment consults constitution and workflow ordering before actioning
- Boundary path:
  - invalid judgment order or unsupported overrides are blocked
- Implementation evidence:
  - `docs/butler/review-protocol.md`
  - `src/core/butler-orchestrator.js`
  - `docs/butler/context-resolution.md`
- Test evidence:
  - `test/butler-orchestrator.test.js`
  - `test/butler-review-protocol.test.js`
  - `test/worker.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-07-butler-constitution-first-judgment.md`
- Status: `implemented_pending_e2e`

## E2E-08 Repo resolution safety + conversation switch confirm

- Issues: `#21 #39 #41`
- Happy path:
  - iPhone-accessible setup wizard returns conversation-ready onboarding with no default repo, copy-ready setup output, full Instructions replacement guidance, schema import URL for Custom GPT action setup, machine-auth setting names, repository switch confirmation flow, and no secret input prompts
- Boundary path:
  - unresolved repo, secret input, or ambiguous switch blocks execution or setup acceptance
- Implementation evidence:
  - `src/core/setup-wizard.js`
  - `src/worker.js`
  - `docs/mvp/iphone-first-setup.md`
- Test evidence:
  - `test/setup-wizard.test.js`
  - `test/worker.test.js`
  - `test/butler-orchestrator.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-08-iphone-setup-and-repo-safety.md`
- Status: `implemented_pending_e2e`

## E2E-09 Memory safety exclusions

- Issues: `#23`
- Happy path:
  - structured operational memory entries persist without raw secrets/transcripts
- Boundary path:
  - secret-like material or full casual transcript is rejected/redacted
- Implementation evidence:
  - `docs/security/memory-safety-policy.md`
  - `src/core/memory-safety.js`
  - `docs/memory/rag-memory-philosophy.md`
- Test evidence:
  - `test/memory-safety.test.js`
  - `test/memory-safety-policy.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-09-memory-safety-exclusions.md`
- Status: `implemented_pending_e2e`

## E2E-10 Surface/role separation invariants

- Issues: `#24 #25`
- Happy path:
  - butler/reviewer/executor boundaries are preserved across allowed operations
- Boundary path:
  - reviewer receives no execution authority and invalid role/surface combinations are rejected
- Implementation evidence:
  - `docs/butler/role-separation.md`
  - `docs/butler/surface-independence.md`
  - `docs/butler/role.md`
  - `src/core/policy.js`
- Test evidence:
  - `test/core-policy.test.js`
  - `test/reviewer-registry.test.js`
  - `test/surface-independence.test.js`
  - `test/role-separation.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-10-surface-and-role-separation.md`
- Status: `implemented_pending_e2e`

## E2E-11 High-risk credential + machine auth path

- Issues: `#22 #47`
- Happy path:
  - gateway accepts valid GitHub App aligned credential flow and machine auth headers for allowed callers
- Boundary path:
  - static/invalid credential path or missing auth headers are blocked
- Implementation evidence:
  - `src/core/github-app-repository-index.js`
  - `docs/mvp/machine-auth-path.md`
  - `src/worker.js`
- Test evidence:
  - `test/github-app-repository-index.test.js`
  - `test/worker.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-11-high-risk-credential-and-machine-auth.md`
- Status: `implemented_pending_e2e`

## E2E-12 Deploy boundary and governed production flow

- Issues: `#37 #75 #90`
- Happy path:
  - production deploy path is explicitly governed, main push does not imply deploy, setup output exposes deploy authority recommendation with detection inputs, production deploy contract details, guarded absence contract details, and guarded absence execution remains traceable for both allowed and blocked paths
- Boundary path:
  - guarded absence blocks high-risk deploy path, deploy workflow requires GO/passkey/production environment, and GitHub protection unavailability degrades setup recommendation to direct provider path
- Implementation evidence:
  - `.github/workflows/deploy-production.yml`
  - `docs/mvp/production-deploy-path.md`
  - `docs/security/guarded-semi-automation-mode.md`
  - `docs/mvp/deploy-authority-branching.md`
  - `src/core/deploy-authority.js`
- Test evidence:
  - `test/production-deploy-path.test.js`
  - `test/guarded-semi-automation-mode.test.js`
  - `test/deploy-authority.test.js`
  - `test/deploy-authority-branching-doc.test.js`
  - `test/worker.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-12-deploy-boundary-and-governed-flow.md`
- Status: `implemented_pending_e2e`

## E2E-13 Reviewer operational loop

- Issues: `#11`
- Happy path:
  - reviewer registry returns valid structured review output in the configured role loop
- Boundary path:
  - invalid reviewer schema or missing reviewer contract is rejected
- Implementation evidence:
  - `src/core/reviewer-registry.js`
  - `docs/security/reviewer-policy.md`
  - `docs/butler/role.md`
- Test evidence:
  - `test/reviewer-registry.test.js`
  - `test/reviewer-policy.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-13-reviewer-operational-loop.md`
- Status: `implemented_pending_e2e`

## Current Completion Reading

- Repository completion status: `partial`
- Main reason:
  - mapped E2E evidence is still pending across the matrix
  - issue closure must remain human-gated
