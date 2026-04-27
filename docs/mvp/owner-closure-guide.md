# Owner Closure Guide

This document is a human-facing closure aid for the remaining open issues that
are plausible human closure candidates.

It does not authorize automatic closure.
It exists so the owner can close or keep open each issue deliberately.

## Issue `#80`

### Recommended reading

`#80` is the strongest current non-parent close candidate.

Why:
- merged implementation exists via PR `#81`
- the Butler Instructions now include the self-reference and natural
  self-parity mapping added for this issue
- current remaining friction is more strongly tied to deploy/runtime drift or
  active fallback design than to `#80`'s core intent

### Close only if the owner agrees all of these are true

- `#80` has finished serving as the self-reference / natural self-parity
  improvement issue
- no additional behavior in that specific slice still needs to land before the
  owner is comfortable closing it

### Keep open if any of these are still useful

- the owner still sees unresolved behavior that belongs to self-reference or
  natural self-parity mapping itself
- the owner wants to validate that behavior in more live iPhone Butler use
  before closing

## Issue `#6`

### Recommended reading

`#6` is historical execution-transport context.
It is not the current parent authority anymore; `#4` now holds that role.
The underlying execution-spine behavior is already evidenced through `E2E-19`.

### Close only if the owner agrees all of these are true

- `#4` and current canonical docs fully supersede the current authority role `#6` once approximated
- the owner no longer needs `#6` as a historical execution-spine marker

### Keep open if any of these are still useful

- the owner wants to preserve historical comparison context in the open set for now
- there is still value in explicitly seeing the earlier execution-spine slice while final parent/spec cleanup is underway

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
  `#82` and `#84` are active

## Non-claim

This guide does not say any issue must be closed now.
It only narrows which issues are close candidates and what human judgment should check.
