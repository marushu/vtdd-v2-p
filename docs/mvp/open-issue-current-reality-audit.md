# Open Issue Current-Reality Audit

This document records the current reading between the GitHub open issue set and
the repository's merged/runtime reality.

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

However, the open issue set now contains three different kinds of items:

1. current active implementation work
2. open issues whose implementation landed and are now mainly waiting on human
   closure judgment
3. historical/context issues that remain open for human judgment rather than
   active implementation

## Current Active Implementation Issues

- `#89`
  - current reading: user-defined repository nickname support is the new active
    implementation slice
  - existing alias/context-first resolution already works, but Butler still
    lacks a persistent user-owned nickname registry for repo calls such as
    `公開VTDD`
  - this remains active runtime/docs/E2E work rather than closure judgment

## Open Issues With Merged Runtime / Docs Progress And Likely Human Closure Work

- `#4`
  - mapped by `E2E-19`
  - current reading: remains the live parent authority for the
    Butler-Codex-Gemini loop

## Resolved Drift Already Observed

The following older readings must not be reintroduced:

- treating `#13` as a currently open issue
- treating `#1` as a currently open issue
- treating `#6` as the current parent authority for the loop
- treating closed issue `#6` as still-open implementation uncertainty
- treating closed issues `#80`, `#82`, and `#84` as still-open active work
- treating closed reviewer-fallback issue `#74` as proof that no-manual Codex
  fallback is already solved
- treating open issue count alone as proof that major runtime work is still
  unimplemented

## Recommended Next Step

The next highest-value cleanup is:

- implement `#89` without weakening `no default repository`
- keep `#4` as the live parent contract while child slices continue landing

The repository still has broad runnable coverage, but the remaining drift is no
longer concentrated on reviewer/deploy rescue slices. It is now concentrated on
making Butler's repository context resolution more operator-friendly without
reintroducing default-repository risk.
