# Open Issue Current-Reality Audit

This document records the current mismatch reading between the GitHub open issue
set and the repository's merged/runtime reality.

It does not close any issue automatically.
It exists to prevent drift between:

- what is still open on GitHub
- what is already implemented/evidenced in-repo
- what still lacks direct close-ready mapping

## Audit Date

- 2026-04-27

## Current Reading

The repository has broad implementation and mapped E2E coverage across the
main-line runtime.

However, the open issue set still contains two different kinds of items:

1. issues that are already implemented and mapped to E2E evidence, awaiting only
   human closure judgment
2. historical/context issues that remain open for human judgment rather than
   active implementation

## Open Issues With Direct Mapped E2E Evidence

These issues already have code/runtime evidence, test evidence, and direct
mapped E2E evidence in `docs/mvp/issue-to-e2e-matrix.md`.

- `#4`
  - mapped by `E2E-19`
- `#42`
  - mapped by `E2E-20`
- `#43`
  - mapped by `E2E-16`
  - mapped by `E2E-17`
- `#44`
  - mapped by `E2E-21`
- `#45`
  - mapped by `E2E-19`
- `#46`
  - mapped by `E2E-22`
- `#15`
  - mapped by `E2E-17`
- `#26`
  - mapped by `E2E-16`
- `#52`
  - mapped by `E2E-14`
- `#55`
  - mapped by `E2E-15`
- `#57`
  - mapped by `E2E-23`
- `#74`
  - mapped by `E2E-25`
- `#9` and `#12`
  - jointly mapped by `E2E-18`

Current reading:
- these are not the main source of implementation uncertainty anymore
- they are best read as `e2e_evidenced_pending_human_closure`

## Historical / Human-Judgment Open Issue

- `#6`

Current reading:
- `#6` is historical execution-spine context
- `#4` is the current parent authority for the loop
- `#6` should not be treated as the current implementation parent
- `#6` is directly evidenced through `E2E-19`, but should still be judged as
  historical context rather than a competing live parent

## Resolved Drift Already Observed

The following older readings must not be reintroduced:

- treating `#13` as a currently open issue
- treating `#1` as a currently open issue
- treating `#6` as the current parent authority for the loop
- treating open issue count alone as proof that major runtime work is still
  unimplemented

## Recommended Next Step

The next highest-value cleanup is:

- decide which of the open E2E-mapped spec/runtime issues are ready for human
  closure judgment
- keep `#6` separate as historical/human-judgment context rather than treating
  it as active implementation uncertainty

This is likely more important than adding new runtime features, because the
repository already has broad runnable coverage and the remaining drift is now
primarily at the owner close-readiness layer.
