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

Local verification caveat:

- `npm test -- test/custom-gpt-setup-docs.test.js test/thread-independent-startup-contract.test.js test/remote-codex-executor.test.js test/vps-runner-script.test.js` reaches `npm run check:generated-worker`, which intentionally fails in the dirty worktree because `worker.js` has generated changes not yet committed. The generated file is included in this PR.

Remaining live evidence:

- This PR does not yet prove a live VPS timer consumed a real post-merge verification request after merge.
- After this PR is merged and deployed, a follow-up Butler request should run `post_merge_verify` against the merged PR and record the resulting GitHub comment URL.

Non-goals:

- Do not deploy from this PR.
- Do not mutate credentials or GitHub App permissions.
- Do not close Issue #397 from code/tests alone without post-merge live evidence and human GO.
