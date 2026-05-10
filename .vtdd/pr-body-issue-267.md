## This PR satisfies Intent

- Reapplies Issue #260 lead-time telemetry from the latest main on fresh branch `codex/issue-267` for Issue #267.
- Supersedes PR #261, which remains untouched because its old branch `codex/issue-260` is conflict-prone.
- Exposes VTDD/Codex execution lead-time telemetry as GitHub-visible runtime truth for Issue #260.

## Satisfied Success Criteria

- Fresh PR branch is based on latest `main` fetched on 2026-05-10.
- Issue #260 lead-time intent is preserved: `queued_at`, `picked_up_at`, `codex_started_at`, `branch_pushed_at`, `pr_created_at`, `completed_at`, `failed_at`, and derived durations are represented.
- execution lead time is visible from Butler via `vtddExecutionProgress` `progress.leadTime`.
- execution lead time is visible from `vtddVpsRunnerStatus` `health.leadTime`.
- GitHub-visible VPS runner state/event comments include concise Lead time lines and JSON `leadTime` runtime truth.
- Queue wait, Codex execution, PR creation, and total lead time durations are computed with readable labels.
- Lead-time duration calculation and formatting are shared by Butler progress reconstruction and VPS runner comment publishing.
- `pr_created_at` and `completed_at` have separate meanings: PR creation can end total lead-time calculation before completion exists, and explicit completion becomes the terminal timestamp when present.
- Reviewer objection is preserved: live GitHub runner E2E and iPhone Butler live E2E remain explicitly unverified, with a reproducible local GitHub comment runtime-truth verification path documented.
- GitHub CI passed on PR #269: `guarded-policy`, `test`, and `review`.
- PR #261 was inspected only through GitHub read operations; no push was made to `codex/issue-260`.

## Unsatisfied Success Criteria

- Live GitHub E2E on a real runner was not executed in this local workspace; this remains the reviewer-raised unverified production path.
- iPhone Butler live E2E was not run because no deploy or live Butler session was authorized.

## Non-goal violations

None.

## Verification Evidence

- Unit: `npm test` passed locally on 2026-05-10: 617 tests passed; runtime setup manifest parity check passed.
- Integration: `node --test test/execution-lead-time.test.js test/remote-codex-executor.test.js test/e2e-30-execution-lead-time-telemetry.test.js` passed locally on 2026-05-10: 37 tests passed.
- CI: PR #269 `guarded-policy`, `test`, and `review` checks passed on 2026-05-10.
- E2E: Not run live; covered by runtime progress/comment contract tests for happy-path, stale/failure boundaries, malformed GitHub comment tolerance, and `pr_created_at` / `completed_at` terminal semantics. Reviewer-raised live GitHub runner E2E and iPhone Butler live E2E remain unverified.
- Manual: Inspected docs/pr-template-model.md, scripts/render-pr-body.mjs, and scripts/validate-pr-body.mjs before drafting; read GitHub Issue #267, Issue #260, and PR #261 runtime truth with `gh` on 2026-05-10.
- Evidence path/link: src/core/execution-lead-time.js; src/core/remote-codex-executor.js; scripts/run-vps-runner.mjs; test/execution-lead-time.test.js; test/remote-codex-executor.test.js; test/vps-runner-script.test.js; docs/mvp/e2e/e2e-30-execution-lead-time-telemetry.md

## Surface Update Checklist

- Cloudflare deploy: Not required.
- Custom GPT Action Schema update: Not required.
- Custom GPT Instructions update: Done in docs only; setup Custom GPT instructions now tell Butler to report `leadTime`.
- iPhone Butler live E2E: Not run.

## Related Constitution Rules

- Issue #267 governs the fresh reapplication task; Issue #260 governs the telemetry implementation intent.
- Do not touch PR #261, merge, deploy, close issues, mutate secrets, permissions, settings, or infrastructure.
- Runtime truth must stay GitHub-visible and concise.

## Out-of-scope but NOT implemented

- PR #261 force push or repair.
- Merge, deploy, issue close, credential mutation, permission mutation, repository settings mutation, or external infrastructure mutation.
- Full tracing UI, external telemetry vendors, log streaming, deploy automation, merge automation, and issue close automation.

## Extra changes (if any)

- Gemini reviewer code-duplication risk from PR #261 remains addressed by centralizing lead-time duration calculation and formatting in src/core/execution-lead-time.js.
- Gemini reviewer ambiguity risk around `pr_created_at` and `completed_at` is addressed with explicit tests and E2E documentation; live E2E objections remain preserved rather than erased.
- PR #261 is superseded by this fresh PR; no additional push was made to PR #261.

<!-- VTDD metadata -->
- Issue: #267
- Related intent issue: #260
- Supersedes: #261
- Execution ID: remote-codex-issue267-5r40ox
- Goal: open_pr
