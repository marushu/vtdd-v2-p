## This PR satisfies Intent

- Expose VTDD/Codex execution lead-time telemetry as GitHub-visible runtime truth for Issue #260.

## Satisfied Success Criteria

- execution lead time is visible from Butler via vtddExecutionProgress progress.leadTime.
- execution lead time is visible from vtddVpsRunnerStatus health.leadTime.
- GitHub-visible VPS runner state/event comments include concise Lead time lines and JSON leadTime runtime truth.
- Queue wait, Codex execution, PR creation, and total lead time durations are computed with readable labels.
- Lead-time duration calculation and formatting are shared by Butler progress reconstruction and VPS runner comment publishing.
- `pr_created_at` remains distinct from `completed_at`; PR creation can end total lead-time calculation without falsifying a completed timestamp.
- Existing execution flow remains compatible; existing event parsing and tests pass.

## Unsatisfied Success Criteria

- Live GitHub E2E on a real runner was not executed in this local workspace; this remains the reviewer-raised unverified production path.

## Non-goal violations

None.

## Verification Evidence

- Unit: npm test (609 tests passed on 2026-05-10).
- Integration: node --test test/execution-lead-time.test.js test/vps-runner-script.test.js test/remote-codex-executor.test.js test/e2e-30-execution-lead-time-telemetry.test.js test/custom-gpt-setup-docs.test.js (81 tests passed on 2026-05-10).
- E2E: Not run live; covered by runtime progress/comment contract tests for happy-path and stale/failure boundaries. Reviewer-raised live GitHub runner E2E and iPhone Butler live E2E remain unverified.
- Manual: Inspected docs/pr-template-model.md, scripts/render-pr-body.mjs, scripts/validate-pr-body.mjs before drafting; read GitHub Issue #260 and PR #261 runtime truth with gh on 2026-05-10.
- Evidence path/link: src/core/execution-lead-time.js; test/execution-lead-time.test.js; test/remote-codex-executor.test.js; test/vps-runner-script.test.js; docs/butler/remote-codex-cli-executor.md

## Surface Update Checklist

- Cloudflare deploy: Not required.
- Custom GPT Action Schema update: Not required.
- Custom GPT Instructions update: Done: setup Custom GPT instructions now tell Butler to report leadTime.
- iPhone Butler live E2E: Not run.

## Related Constitution Rules

- Issue #260 is the only implementation scope.
- Do not merge, deploy, close issues, mutate secrets, permissions, settings, or infrastructure.
- Runtime truth must stay GitHub-visible and concise.

## Out-of-scope but NOT implemented

- Full tracing UI.
- External telemetry vendors.
- Log streaming.
- Deploy, merge, or issue close automation.

## Extra changes (if any)

- Gemini reviewer code-duplication risk addressed by centralizing lead-time duration calculation and formatting in src/core/execution-lead-time.js.
- Gemini reviewer PR-body mismatch is addressed by this guarded PR body draft and the live PR body sync for PR #261.

<!-- VTDD metadata -->
- Issue: #260
- Execution ID: remote-codex-issue260-iogni0
- Goal: revise_pr
