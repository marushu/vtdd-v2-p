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

However, the open issue set now contains four different kinds of items:

1. current active implementation work
2. current active spec / boundary-definition work
3. open issues whose implementation landed and are now mainly waiting on human
   closure judgment
4. historical/context issues that remain open for human judgment rather than
   active implementation

## Current Active Implementation Issues

- `#82`
  - merged progress exists through PRs `#83` and `#85`
  - current reading: the governed deploy plane and self-parity deploy manifest
    landed, but natural-language Butler orchestration from stale parity into
    `GO + real passkey` deploy is still incomplete

## Current Active Spec / Boundary Issues

- `#84`
  - current reading: bot-authored `@codex review` fallback is not equivalent to
    owner-authored Codex invocation
  - manual copy-paste fallback is explicitly not the desired steady-state
    answer
  - this remains active design work, not close-ready evidence-only work

## Open Issues With Merged Runtime / Docs Progress And Likely Human Closure Work

- `#80`
  - merged via PR `#81`
  - current reading: self-reference and natural self-parity trigger mapping are
    implemented; remaining work is mainly human closure judgment unless new
    gaps are found
- `#4`
  - mapped by `E2E-19`
  - current reading: remains the live parent authority for the
    Butler-Codex-Gemini loop

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
- treating closed reviewer-fallback issue `#74` as proof that no-manual Codex
  fallback is already solved
- treating open issue count alone as proof that major runtime work is still
  unimplemented
- treating the remaining work as mostly close-readiness while `#82` and `#84`
  are still active implementation/spec gaps

## Recommended Next Step

The next highest-value cleanup is:

- keep `#82` and `#84` visible as current active work rather than reading the
  repo as mostly closure-ready
- decide whether `#80` is ready for human closure judgment
- keep `#6` separate as historical/human-judgment context rather than treating
  it as active implementation uncertainty

The repository still has broad runnable coverage, but the remaining drift is no
longer only at the owner close-readiness layer; it also includes active deploy
orchestration and reviewer-fallback boundary work.
