# E2E-33: Butler-triggered post-merge verification

Issue: #397

Purpose:

- Let Butler request the post-merge checks that mac Codex previously performed manually.
- Keep the verification bounded to an already merged PR and its base branch.
- Record enough GitHub-visible evidence for the owner to judge whether post-merge Issue closure can continue.

Happy path:

1. Butler reads the target PR runtime truth and confirms the PR is merged.
2. Butler dispatches `vtddExecute` with `executorTransport=vps_runner` and `continuationContext.codexGoal=post_merge_verify`.
3. The queued request names the merged PR, base branch, merge commit, and repository.
4. The VPS runner consumes the request as a verification task, not as a Codex editing task.
5. The runner checks GitHub PR truth, VPS main sync, runner service/timer state, and pending runner queues.
6. The runner posts GitHub-visible `completed` evidence when all checks pass.

Boundary path:

- Missing PR number is rejected before execution.
- An unmerged, open, or branch-mismatched PR is rejected before queueing.
- If VPS main cannot fast-forward, the merge commit is not reachable, runner service/timer is inactive, or pending runner items remain, the runner posts a blocked result instead of claiming completion.

Implementation evidence:

- `src/core/remote-codex-executor.js`
- `scripts/run-vps-runner.mjs`
- `docs/butler/remote-codex-cli-executor.md`
- `docs/setup/custom-gpt-actions-openapi.yaml`
- `docs/setup/custom-gpt-instructions.md`

Test evidence:

- `test/remote-codex-executor.test.js`
- `test/vps-runner-script.test.js`
- `test/custom-gpt-setup-docs.test.js`

Run evidence:

- `node --test` passed locally with 805 passing tests and 1 skipped test.
- `npm run check:self-parity` passed after Action Schema and setup instruction updates.
- `npm run build:worker` regenerated `worker.js`.
- PR #398 merged at `2026-05-15T14:23:29Z` with merge commit `9366aeef11f90d8e608b5e735fda7ff1fc07c35d`.
- Deployed runtime `/setup/latest?ref=main` reported `Self-parity: in_sync` and `Deploy state: in_sync`.
- Butler-equivalent `vtddExecute` dispatch created the VPS runner queue comment:
  - <https://github.com/marushu/vtdd-v2-p/issues/397#issuecomment-4460661862>
- VPS runner picked up the request:
  - <https://github.com/marushu/vtdd-v2-p/issues/397#issuecomment-4460670769>
- VPS runner posted terminal `post_merge_verification_completed` evidence:
  - <https://github.com/marushu/vtdd-v2-p/issues/397#issuecomment-4460673355>

Local verification caveat:

- Before PR #398 was committed, `npm test -- test/custom-gpt-setup-docs.test.js test/thread-independent-startup-contract.test.js test/remote-codex-executor.test.js test/vps-runner-script.test.js` reached `npm run check:generated-worker`, which intentionally failed in the dirty worktree because `worker.js` had generated changes not yet committed.
- After the generated file was committed, `npm run check:generated-worker` passed.

Remaining live evidence:

- None for Issue #397. The live VPS post-merge verification path has recorded terminal GitHub-visible evidence.

Non-goals:

- Do not deploy from this PR.
- Do not mutate credentials or GitHub App permissions.
- Do not close Issue #397 without human GO, even though post-merge live evidence now exists.
