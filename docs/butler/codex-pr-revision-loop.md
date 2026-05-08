# Butler-Codex PR Revision Loop

This document is the canonical runtime contract for Issue #4.

## Core Reading

VTDD execution keeps three layers separate:

- Issue is the canonical execution spec
- GitHub state is the canonical runtime truth for current progress
- handoff is a Butler-triggered bridge only when execution must move across Codex contexts

`git diff` may be runtime truth for current progress.
It is not the execution spec.

## Default Flow

The canonical execution path is:

`Butler -> Codex -> PR -> Gemini review comments -> Butler summary -> human decision`

Codex's bounded goal for this slice is PR creation and PR revision work.
Merge remains a human `GO` decision.
Codex authority return remains GitHub-observable and Butler-mediated, not a
private chat backchannel.

## Resume-first Rule

Before creating a handoff, Butler must first read GitHub runtime truth:

- target Issue
- active branch
- current diff / commits
- existing PR, if any
- review comments
- unresolved review state

If the same bounded work can safely continue from GitHub runtime truth, the
system should resume without creating a handoff.

## Handoff-when-needed Rule

Explicit handoff is required only for Butler-mediated execution transfer.

Typical cases:

- iPhone-side Butler conversation must bridge into another Codex execution context
- GitHub runtime truth alone is not enough to resume safely
- approval scope or issue traceability needs to be restated before execution

The handoff must preserve:

- issue traceability
- approval scope
- non-goals
- bounded execution intent

## PR Revision Loop

After Codex creates a PR:

1. Gemini returns critical review as PR comments
2. If Gemini is unavailable, a Codex reviewer fallback may produce critical
   PR comments without execution credentials
3. Butler summarizes PR state and review comments for the human
4. Butler suggests the next safe action
5. If the human approves a bounded fix, Butler dispatches `codexGoal=revise_pr`
   through the user-owned VPS runner
6. The VPS runner checks out the existing PR branch, includes PR review
   comments in the Codex prompt, and pushes a fix commit back to that branch
7. Gemini re-runs critical review when the PR changes or new comments arrive
8. Butler re-summarizes the updated PR state for the human
9. merge remains blocked until the human gives `GO + real passkey`

For draft PRs, Butler must not pretend GitHub can merge the draft directly.
The safe merge path is:

1. high-risk approval for ready-for-review authority, when required by policy
2. convert the PR from draft to ready for review
3. re-read checks and reviewer state
4. high-risk approval for merge
5. merge only when runtime truth still satisfies the scoped criteria

## Role Boundaries

### Butler

- reads runtime truth
- decides `resume` vs `handoff required`
- summarizes PR and review comments
- returns deterministic synthesis that preserves reviewer objections and next safe actions
- suggests the next safe action

### Codex

- performs bounded coding work
- creates and updates the PR
- responds on the PR within approved scope
- returns control through GitHub-observable state when approval, scope, review,
  or runtime-truth boundaries are reached

### Codex Reviewer Fallback

- runs as a separate review role from the executor
- receives PR diff/context and reviewer instructions, not execution authority
- must not receive deploy, merge, secret, permission, or repository-admin credentials
- produces review findings and recommended action only
- is useful even though it is AI-based because role, prompt, context, and
  authority are intentionally separated from the executor

### Gemini

- provides critical review through PR comments
- does not execute fixes
- does not decide merge

## Invariants

- no speculative coding beyond Issue scope
- no treating handoff as canonical spec
- no merge without explicit human `GO + real passkey`
- no erasing meaningful reviewer objections in Butler summaries
- no invisible Codex-to-Butler authority channel outside GitHub-observable
  runtime truth
