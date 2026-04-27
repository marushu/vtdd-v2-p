# Owner Closure Guide

This document is a human-facing closure aid for the remaining open issues that
are plausible human closure candidates.

It does not authorize automatic closure.
It exists so the owner can close or keep open each issue deliberately.

## Issue `#89`

### Recommended reading

`#89` is the current active non-parent implementation issue.

Why:
- Butler already has alias/context-first repository resolution
- the remaining friction is user-owned nickname persistence and recall, not
  loop/reviewer/deploy foundations
- this issue is the current place to improve repo naming UX without weakening
  `no default repository`

### Close only if the owner agrees all of these are true

- user-defined repository nickname storage and retrieval are merged
- Butler can safely resolve those nicknames in practice
- no meaningful gap remains in this specific nickname slice

### Keep open if any of these are still useful

- the owner still sees Butler forcing too much canonical owner/repo spelling
- nickname persistence, retrieval, or ambiguity handling still needs work

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
  `#89` is active

## Non-claim

This guide does not say any issue must be closed now.
It only narrows which issues are close candidates and what human judgment should check.
