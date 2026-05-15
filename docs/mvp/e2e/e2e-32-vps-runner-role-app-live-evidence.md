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

Non-goals:

- Do not change runtime behavior in this evidence PR.
- Do not close Issue #393 from this evidence note alone.
- Do not persist or display secrets, private keys, bearer tokens, or approval grants.
