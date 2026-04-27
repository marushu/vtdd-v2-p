# Issue-to-E2E Matrix

This document is the canonical tracking matrix for Issue #54.

Repository status must be treated as partial until every listed E2E scenario has:

- implementation evidence in repo
- test evidence
- mapped happy-path result
- mapped boundary/failure-path result
- human approval for closure when applicable

This matrix sits above the `live_verified` contract in
`docs/mvp/live-verified-contract.md`.
Human-observable runtime evidence is the floor; mapped E2E evidence and human
closure judgment remain required for milestone completion.

Status values used below:

- `docs_only`: docs/spec/contracts exist, but no connected runtime/code path exists yet
- `code_only`: code and/or tests exist, but no connected Butler/worker surface exists yet
- `surface_connected`: a worker/Butler/action path exists, but human-observable external evidence is still missing
- `live_verified`: the intended behavior is connected and a human can observe the relevant external effect

- `implemented_pending_e2e`: code and tests exist, but mapped E2E evidence is still pending
- `e2e_evidenced_pending_human_closure`: implementation, tests, and mapped E2E run evidence exist, but human closure judgment is still pending
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
  - `README.md`
  - `docs/mvp/next-step-handoff.md`
- Test evidence:
  - `test/e2e-13-parent-readiness.test.js`
  - `test/issue-triage-plan-current-state.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-13-parent-readiness.md`
- Status: `e2e_evidenced_pending_human_closure`

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
- Status: `e2e_evidenced_pending_human_closure`

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
- Status: `e2e_evidenced_pending_human_closure`

## E2E-03 Memory schema/provider contract

- Issues: `#2 #3`
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
- Status: `e2e_evidenced_pending_human_closure`

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
- Status: `e2e_evidenced_pending_human_closure`

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
  - `test/decision-log-model.test.js`
  - `test/proposal-log-model.test.js`
  - `test/decision-log-runtime.test.js`
  - `test/proposal-log-runtime.test.js`
  - `test/log-store.test.js`
  - `test/worker.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-05-decision-proposal-durability.md`
- Status: `e2e_evidenced_pending_human_closure`

## E2E-06 Policy/consent/approval/state machine

- Issues: `#8 #10`
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
- Status: `e2e_evidenced_pending_human_closure`

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
- Status: `e2e_evidenced_pending_human_closure`

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
- Status: `e2e_evidenced_pending_human_closure`

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
- Status: `e2e_evidenced_pending_human_closure`

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
- Status: `e2e_evidenced_pending_human_closure`

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
- Status: `e2e_evidenced_pending_human_closure`

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
- Status: `e2e_evidenced_pending_human_closure`

## E2E-14 GitHub normal write plane

- Issues: `#52`
- Happy path:
  - scoped `GO`-tier issue comments, branch creation, PR create/update, and PR comments execute through the GitHub normal write plane
- Boundary path:
  - missing `GO`, missing scope match, or unsupported high-risk operations are rejected instead of silently executing
- Implementation evidence:
  - `src/core/github-write-plane.js`
  - `src/worker.js`
  - `docs/setup/custom-gpt-actions-openapi.yaml`
  - `docs/setup/custom-gpt-instructions.md`
- Test evidence:
  - `test/github-write-plane.test.js`
  - `test/worker.test.js`
  - `test/custom-gpt-setup-docs.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-14-github-normal-write-plane.md`
- Status: `e2e_evidenced_pending_human_closure`

## E2E-15 GitHub high-risk authority plane

- Issues: `#55`
- Happy path:
  - Butler-side authority execution performs bounded PR merge and bounded issue close through the GitHub high-risk plane with scoped `GO + real passkey`
- Boundary path:
  - missing real approval grant or missing merged-pull proof blocks merge/issue close instead of silently mutating GitHub state
- Implementation evidence:
  - `src/core/github-high-risk-plane.js`
  - `src/core/approval.js`
  - `src/worker.js`
  - `docs/setup/custom-gpt-actions-openapi.yaml`
  - `docs/setup/custom-gpt-instructions.md`
- Test evidence:
  - `test/github-high-risk-plane.test.js`
  - `test/worker.test.js`
  - `test/custom-gpt-setup-docs.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-15-github-high-risk-authority-plane.md`
- Status: `e2e_evidenced_pending_human_closure`

## E2E-16 Worker passkey secret sync bridge

- Issues: `#26`
- Happy path:
  - Worker-hosted section `3. GitHub App Secret Sync` connects to the canonical desktop bootstrap/update bridge when an explicit `syncApiBase` is provided
- Boundary path:
  - absent or invalid desktop bridge leaves section `3` disabled and surfaces `desktop maintenance required` instead of implying a Worker-only sync path
- Implementation evidence:
  - `src/core/passkey-operator-page.js`
  - `src/worker.js`
  - `scripts/run-passkey-operator-helper.mjs`
  - `docs/setup/github-app-secret-sync.md`
- Test evidence:
  - `test/passkey-operator-page.test.js`
  - `test/passkey-operator-helper.test.js`
  - `test/github-app-secret-sync.test.js`
  - `test/worker.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-16-worker-passkey-secret-sync-bridge.md`
- Status: `e2e_evidenced_pending_human_closure`

## E2E-17 GitHub App secret sync bootstrap

- Issues: `#15`
- Happy path:
  - an explicit operator bootstrap/update path syncs GitHub App root material from `~/.vtdd/credentials/manifest.json` into GitHub Actions/runtime secrets with approval-bound execution
- Boundary path:
  - invalid secret-sync approval scope, missing `approvalGrantId`, or missing machine auth blocks execution instead of implying ad hoc manual copying or steady-state desktop dependency
- Implementation evidence:
  - `scripts/sync-github-app-actions-secrets.mjs`
  - `src/core/github-app-secret-sync.js`
  - `docs/setup/github-app-secret-sync.md`
- Test evidence:
  - `test/github-app-secret-sync.test.js`
  - `test/passkey-operator-helper.test.js`
  - `test/worker.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-17-github-app-secret-sync-bootstrap.md`
- Status: `e2e_evidenced_pending_human_closure`

## E2E-18 Gemini PR review comment writeback

- Issues: `#9 #12`
- Happy path:
  - a PR-triggered Gemini reviewer workflow writes a traceable VTDD Gemini review comment back to the PR through the GitHub App token path
- Boundary path:
  - missing GitHub App reviewer secrets or self-marker reruns do not silently write comments or create uncontrolled comment loops
- Implementation evidence:
  - `.github/workflows/gemini-pr-review.yml`
  - `scripts/run-gemini-pr-review.mjs`
  - `docs/butler/gemini-pr-review-comments.md`
- Test evidence:
  - `test/gemini-pr-review-workflow.test.js`
  - `test/gemini-pr-review.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-18-gemini-pr-review-comment-writeback.md`
- Status: `e2e_evidenced_pending_human_closure`

## E2E-19 Butler-Codex-Gemini PR revision loop

- Issues: `#4`
- Happy path:
  - Butler reads GitHub runtime truth, returns `resume` continuity guidance, and exposes PR/review synthesis that points Codex toward bounded PR revision work
- Boundary path:
  - Butler blocks execution when a mediated transfer requires handoff but the handoff contract is missing or not issue-traceable
- Implementation evidence:
  - `src/core/execution-continuity.js`
  - `src/core/butler-review-synthesis.js`
  - `src/core/mvp-gateway.js`
  - `src/worker.js`
  - `docs/butler/codex-pr-revision-loop.md`
- Test evidence:
  - `test/execution-continuity.test.js`
  - `test/butler-review-synthesis.test.js`
  - `test/mvp-gateway.test.js`
  - `test/worker.test.js`
- Run evidence:
  - `docs/mvp/e2e/e2e-19-butler-codex-gemini-pr-revision-loop.md`
- Status: `e2e_evidenced_pending_human_closure`

## Current Completion Reading

- Repository completion status: `partial`
- Main reason:
  - mapped E2E evidence now exists across the active main-line matrix
  - issue closure must remain human-gated
  - parent/spec issues remain intentionally open until the owner judges closure
