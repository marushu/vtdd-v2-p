# Owner Closure Guide

This document is a human-facing closure aid for the remaining open issues that
are plausible human closure candidates.

It does not authorize automatic closure.
It exists so the owner can close or keep open each issue deliberately.

## Issue `#91`

### Recommended reading

`#91` is the current active non-parent implementation issue.

Why:
- Butler already has governed deploy and same-origin passkey operator support
- the remaining friction is returning the tappable operator URL directly inside
  the conversation, not the deploy plane itself
- this issue is the current place to improve iPhone deploy recovery UX without
  weakening `GO + real passkey`

### Close only if the owner agrees all of these are true

- user-defined repository nickname storage and retrieval are merged
- Butler can return a direct passkey operator URL when deploy stale is detected
- no meaningful gap remains in this specific iPhone deploy recovery slice

### Keep open if any of these are still useful

- the owner still cannot move from Butler conversation to passkey operator page
  without rebuilding the URL by hand
- direct operator link guidance still needs work

## Issue `#4`

### Recommended reading

`#4` remains the live parent authority for the Butler-Codex-Gemini loop.

### Close only if the owner agrees all of these are true

- current canonical docs and issue set fully replace the need for `#4` as the
  live loop parent
- the owner no longer wants one still-open parent issue for loop-level
  supervision and wording

### Keep open if any of these are still useful

- the owner wants one still-open parent issue for the loop
- parent-level wording or acceptance boundaries may still be refined while
  `#91` is active

## Non-claim

This guide does not say any issue must be closed now.
It only narrows which issues are close candidates and what human judgment should check.
