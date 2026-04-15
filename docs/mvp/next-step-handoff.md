# Next-step Handoff

This file exists so implementation can start in a fresh thread without re-deriving the current planning state.

## Ready State

- MVP parent docs are in `docs/`
- `docs/mvp/bootstrap-plan.md` bundles the current issue map
- `docs/mvp/issue-13-rewrite-draft.md` contains the final rewrite for issue `#13`
- `docs/mvp/issue-triage-plan.md` contains duplicate/merge/new triage and ready-to-post issue bodies

## Immediate Actions (Before Implementation)

1. Update issue `#13` with `docs/mvp/issue-13-rewrite-draft.md`.
2. Create new issues in the order written in `docs/mvp/issue-triage-plan.md`.
3. Update `#11` with a short note linking role/reviewer separation follow-up issue.
4. Keep implementation paused until those issue updates are merged into the planning baseline.

## Boundary

Do not begin implementation code from this handoff alone.
Use updated `#13` as the execution anchor and treat new issues as missing canonical spec fixes.
