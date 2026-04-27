# E2E-19 Butler-Codex-Gemini PR Revision Loop Evidence

This document records concrete run evidence for the E2E-19 track.

## Scope

Issues:
- `#4`
- `#45`
- parent anchor: `#13`

Goal:
- confirm Butler can read GitHub runtime truth and decide `resume` vs `handoff required`
- confirm Butler exposes PR/review synthesis that preserves reviewer objections and next safe actions
- confirm the loop remains blocked when a Butler-mediated transfer lacks a bounded handoff contract

## Happy-path Run

Command:

```sh
node --test test/execution-continuity.test.js test/butler-review-synthesis.test.js test/mvp-gateway.test.js test/worker.test.js
```

Observed result on 2026-04-26:
- passed
- confirms `evaluateExecutionContinuity` defaults to `resume` and targets `open_pr` when no PR exists
- confirms open PR runtime truth with unresolved Gemini review comments shifts Codex goal to `revise_pr`
- confirms Butler review synthesis is available from gateway/worker-facing continuity output
- confirms Butler synthesis preserves reviewer objections and suggests bounded next actions such as `apply_pr_feedback` and `rerun_gemini_review`

## Boundary-path Run

Command:

```sh
node --test test/execution-continuity.test.js test/mvp-gateway.test.js test/worker.test.js
```

Observed result on 2026-04-26:
- passed
- confirms Butler blocks execution continuity when a mediated transfer requires handoff and no bounded handoff contract is present
- confirms handoff must remain issue-traceable and approval-scope preserving
- confirms merge does not appear as an automatic next action and remains gated for later human `GO + real passkey`

## Evidence Files

- `src/core/execution-continuity.js`
- `src/core/butler-review-synthesis.js`
- `src/core/mvp-gateway.js`
- `src/worker.js`
- `docs/butler/codex-pr-revision-loop.md`
- `test/execution-continuity.test.js`
- `test/butler-review-synthesis.test.js`
- `test/mvp-gateway.test.js`
- `test/worker.test.js`

## Current Reading

E2E-19 now has recorded happy-path and boundary-path run evidence in-repo.

This confirms the revision loop contract for Issue `#4` is connected through
gateway/worker continuity and Butler synthesis outputs.
It does not claim merge automation or final milestone completion.
