# Close-readiness Audit

This document records the current close-readiness reading for the remaining open
issues that are best interpreted through human closure judgment rather than
active implementation.

It does not close any Issue automatically.
Human judgment is still required.

For the broader open-issue vs current-reality mismatch inventory, also read:

- `docs/mvp/open-issue-current-reality-audit.md`

## Current Human-judgment / Parent / Historical Issues

- `#80` self-parity natural-language trigger improvement
- `#4` current loop parent
- `#6` historical execution-slice issue

The following open issues are intentionally not treated as close-readiness-only
items here because they still represent active implementation/spec work:

- `#82`
- `#84`

## Current Reading

### `#4`

`#4` is the current parent contract for the Butler-Codex-Gemini revision loop.

It should remain open while:

- the owner still wants one live parent for runtime-loop judgment
- loop-level completion or authority wording may still be refined
- child execution/reviewer/synthesis slices are still being reviewed for final closure

### `#6`

`#6` remains a historical execution-slice issue.
It should not compete with `#4` as a current parent authority.
Its execution-spine behavior is already directly evidenced through `E2E-19`.
It may remain open as comparison context or be closed when the owner is
satisfied that:

- `#4` and current canonical docs fully cover the current loop authority
- the historical execution-spine role of `#6` no longer needs to remain visible
  in the open set

### `#80`

`#80` has merged implementation progress for self-reference and natural
self-parity trigger mapping.

It may be close-ready if the owner agrees that:

- the merged Instructions path is sufficient for the desired Butler self-parity
  behavior
- any remaining self-parity confusion is now implementation drift elsewhere,
  not missing `#80` scope

Keep it open if:

- the owner still sees meaningful gaps in Butler self-reference / update-check
  handling that belong to `#80` itself
- follow-up behavior changes are expected before judging the issue complete

## Non-claim

This audit does not claim repository completion.
It only narrows which currently open issues are best read through human
closure judgment rather than active implementation.
