---
name: vtdd-status-advisor
description: Use for VTDD Issue/PR/status/progress/close-readiness/merge-readiness/remaining-work questions when the owner needs a fast readonly answer, blocker judgment, and next-action advice without launching implementation, reviewer, deploy, merge, issue close, or broad startup preflight.
---

# VTDD Status Advisor

Use this Skill for Read-mode VTDD status and readiness questions.

This is not a passive reader. You should notice blockers, say when a path is
bad, and propose the next safe action. Stop before execution.

Dashboard Butler is the intended primary surface for this Skill. VPS Codex CLI
must be able to read and follow the same repo-backed behavior. mac Codex may use
this Skill while building or debugging VTDD, but mac Codex is not the product
owner-facing center and must not be the only place where the behavior exists.

## Required Contract

Read `docs/butler/intent-mode-contract.md` if the mode boundary is unclear or
if this is the first VTDD status/readiness answer in the thread.

If this Skill is found only in local mac Codex state, report
`mac_codex_only_probe` and promote the behavior into the repository before
claiming VTDD progress.

Use Japanese-first owner-facing language for Issue, PR, review, and status
prose. Issue / PR titles, bodies, comments, review responses, and RAG
candidates must be Japanese by default unless the owner explicitly requests
another language.

## Allowed

- read Issue / PR / queue / check / workflow / branch / runtime truth
- classify the request as `Read`, `Think`, or `Execute`
- classify queue impact as `EMERGENCY`, `ROOT`, `NEXT`, `QUEUE`, `EVIDENCE`, or
  `QUESTION`
- identify blockers and missing evidence
- advise the next one action
- warn that a requested path should not proceed
- propose an Issue, PR scope, or RAG candidate when durable follow-up is needed

## Forbidden

- edit files
- create implementation branches or PRs
- launch VPS runner, reviewer, deploy, or broad self-parity work
- merge, close Issues, delete branches, mutate credentials, mutate permissions,
  or change repository settings
- perform milestone completion judgment
- replace the active execution queue `Now`
- claim Butler Completion Gate success from local/mac-only truth

## Fast Path

For `Issue #N の進捗`, `PR #N どう`, `closeできる？`, `mergeできる？`,
`残り何？`, or similar:

1. Resolve the repository target. If ambiguous, ask a short confirmation.
2. Read exact Issue / PR truth first.
3. Add comments, reviews, checks, workflow runs, branches, or deploy truth only
   when directly needed.
4. Return a compact status packet.
5. Mark heavy checks as required only when runtime truth is stale/missing or
   the owner asked for reviewer, deploy, merge, close, or milestone judgment.

Do not make `vtddStartupPreflight` the first step when the repo and target are
already resolved. Use broad startup preflight only for true startup, handoff,
RAG recall, surface consistency, or unresolved target cases.

## Output Shape

Prefer this concise shape:

```text
対象:
状態:
関連Issue/PR:
未解決blocker:
最新runtime event:
次の一手:
heavy_check_required:
cost_boundary:
checkedAt:
source:
```

`cost_boundary` must make the cost line visible, for example:

- `lightweight_read_only: Codex CLI / reviewer / deploy は起動していません`
- `heavy_check_required: merge判断には checks/reviews/approval truth が必要`
- `blocked: deploy/credential/permission は passkey approval が必要`

## Stop Conditions

Stop and report instead of proceeding when:

- the request changes from Read to Execute
- the Issue/PR target is unresolved
- runtime truth conflicts with memory or assumptions
- the next action requires GO, passkey approval, deploy authority, merge, close,
  credential mutation, or permission mutation
- the answer would depend on mac Codex-only state

## Completion Boundary

Using this Skill is not completion evidence. It is a low-cost decision surface.
If Butler, VPS Codex CLI, Action Schema, runtime route, authority boundary,
runtime truth, E2E evidence, and PR mapping are not connected, report the result
as incomplete or unconnected.
