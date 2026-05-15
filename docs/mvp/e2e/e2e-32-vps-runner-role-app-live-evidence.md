# E2E-32: VPS runner role App live evidence

Issue: #393

Purpose:

- Prove that a Codex fallback reviewer request can be consumed by the VPS runner.
- Prove that the completed reviewer comment is posted by the VTDD Codex Fallback Reviewer GitHub App, not by `marushu`.
- Keep the evidence separate from old draft PRs so the result can be read without confusing it with stale work.

Live evidence plan:

1. Open a small PR containing only this evidence note.
2. Add one bounded Codex fallback requested marker comment to that PR.
3. Run the VPS runner once, or let the enabled VPS runner timer pick it up.
4. Confirm that the terminal comment is a completed or blocked reviewer result.
5. Confirm that the visible GitHub actor is the expected role App.

Observed live run on PR #396:

- Requested marker: <https://github.com/marushu/vtdd-v2-p/pull/396#issuecomment-4459051036>
- VPS runner once result: `VPS Codex reviewer fallback completed for marushu/vtdd-v2-p#396.`
- Expected visible actor was confirmed: `vtdd-codex-fallback-reviewer[bot]`.
- Terminal comments were posted by the expected role App:
  - <https://github.com/marushu/vtdd-v2-p/pull/396#issuecomment-4459055374>
  - <https://github.com/marushu/vtdd-v2-p/pull/396#issuecomment-4459056235>
  - <https://github.com/marushu/vtdd-v2-p/pull/396#issuecomment-4459061782>

Boundary failure found:

- The runner posted more than one `completed` comment when the completed result was `request_changes`.
- Root cause: `selectPendingVpsReviewerFallbacks` only stopped on reviewer terminal approval. It did not treat `completed + request_changes` or `blocked` as a resolved fallback request.
- Immediate containment: the requested marker was edited to `Status: blocked`, and the VPS runner timer was temporarily stopped before more comments accumulated.
- Fix: VPS runner selection now uses reviewer resolved state for Codex fallback requests. `completed` and `blocked` are terminal for request consumption; only `approve` remains terminal approval for merge-readiness semantics.

Post-fix verification:

- `npm test -- test/vps-runner-script.test.js`
- `npm run build:worker`
- New head requested marker: <https://github.com/marushu/vtdd-v2-p/pull/396#issuecomment-4459115593>
- Post-fix terminal comment: <https://github.com/marushu/vtdd-v2-p/pull/396#issuecomment-4459124956>
- Post-fix dry-run on VPS branch returned: `No pending VPS runner execution found.`

Non-goals:

- Do not change runtime behavior in this evidence PR.
- Do not close Issue #393 from this evidence note alone.
- Do not persist or display secrets, private keys, bearer tokens, or approval grants.
