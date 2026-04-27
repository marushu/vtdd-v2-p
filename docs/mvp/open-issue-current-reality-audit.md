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

However, the open issue set still contains three different kinds of items:

1. issues that are already implemented and mapped to E2E evidence, awaiting only
   human closure judgment
2. issues that are substantially reflected in docs/runtime, but still lack a
   direct issue-to-E2E mapping entry
3. historical/context issues that remain open for human judgment rather than
   active implementation

## Open Issues With Direct Mapped E2E Evidence

These issues already have code/runtime evidence, test evidence, and direct
mapped E2E evidence in `docs/mvp/issue-to-e2e-matrix.md`.

- `#4`
  - mapped by `E2E-19`
- `#15`
  - mapped by `E2E-17`
- `#26`
  - mapped by `E2E-16`
- `#52`
  - mapped by `E2E-14`
- `#55`
  - mapped by `E2E-15`
- `#9` and `#12`
  - jointly mapped by `E2E-18`

Current reading:
- these are not the main source of implementation uncertainty anymore
- they are best read as `e2e_evidenced_pending_human_closure`

## Open Issues Still Missing Direct Matrix Mapping

These issues remain open, and current repository reality suggests they are
either implemented or substantially canonicalized, but the current matrix does
not yet point to them directly as issue-level tracks.

- `#42`
  - canonicalized GitHub operation plane
- `#43`
  - canonicalized desktop bootstrap vault
- `#44`
  - canonicalized `live_verified` completion contract
- `#45`
  - canonicalized Butler-Codex-Human authority model
- `#46`
  - GitHub read plane runtime
- `#57`
  - PR body guardrail / helper path

Current reading:
- these are the main remaining mismatch set between open issues and current repo
  status
- they should either:
  - gain direct mapped issue-to-E2E/audit coverage, or
  - be treated by the owner as close-ready based on narrower evidence

## Historical / Human-Judgment Open Issue

- `#6`

Current reading:
- `#6` is historical execution-spine context
- `#4` is the current parent authority for the loop
- `#6` should not be treated as the current implementation parent

## Resolved Drift Already Observed

The following older readings must not be reintroduced:

- treating `#13` as a currently open issue
- treating `#1` as a currently open issue
- treating `#6` as the current parent authority for the loop
- treating open issue count alone as proof that major runtime work is still
  unimplemented

## Recommended Next Step

The next highest-value cleanup is:

- reconcile the open spec/runtime issues that lack direct matrix mapping
  (`#42 #43 #44 #45 #46 #57`)

This is likely more important than adding new runtime features, because the
repository already has broad runnable coverage but still carries issue/reality
drift at the close-readiness layer.
