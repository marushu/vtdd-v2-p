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
2. Butler summarizes PR state and review comments for the human
3. Butler suggests the next safe action
4. Codex performs bounded PR updates and PR comment responses as directed
5. Gemini re-runs critical review when the PR changes or new comments arrive
6. Butler re-summarizes the updated PR state for the human
7. merge remains blocked until the human gives `GO`

## Role Boundaries

### Butler

- reads runtime truth
- decides `resume` vs `handoff required`
- summarizes PR and review comments
- suggests the next safe action

### Codex

- performs bounded coding work
- creates and updates the PR
- responds on the PR within approved scope

### Gemini

- provides critical review through PR comments
- does not execute fixes
- does not decide merge

## Invariants

- no speculative coding beyond Issue scope
- no treating handoff as canonical spec
- no merge without explicit human `GO`
- no erasing meaningful reviewer objections in Butler summaries
