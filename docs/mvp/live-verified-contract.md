# Live Verified Contract

This document is the canonical completion contract for Issue #44.

## Intent

`live_verified` must mean human-observable external evidence.

Completion must not be claimed from local files, task summaries, invisible
runtime flags, or docs-only contract work alone.

## Core Rule

`live_verified` is reached only when a human can observe the relevant external
state that proves the behavior actually works.

For VTDD, valid external evidence includes GitHub-visible state, Worker-visible
state, or other operator-observable platform state tied to the scoped behavior.

## Insufficient On Their Own

The following are insufficient on their own and must never be treated as
`live_verified`:

- a file existing in the repository
- code that compiles or tests locally without external observable effect
- a Codex task summary
- an internal runtime flag
- a docs-only contract
- an unpublished branch-local change

## Status Vocabulary

Use the following status vocabulary when reporting progress for a scoped VTDD
slice:

- `docs_only`
  - docs/spec/contracts exist, but no connected runtime/code path exists yet
- `code_only`
  - code and/or tests exist, but no connected Butler/worker surface exists yet
- `surface_connected`
  - a worker/Butler/action path exists, but the intended behavior is not yet
    evidenced through human-observable external state
- `live_verified`
  - the intended behavior is connected and a human can observe the relevant
    external effect

Do not collapse these states into "done."

## Canonical Evidence Mapping

### Repository listing

- Not enough:
  - repository index code exists
  - Butler claims repositories were found
- `live_verified` evidence:
  - a human can see the repository list returned through Butler or the worker
    route, and the names match actual GitHub repositories

### Issue listing/detail

- Not enough:
  - issue retrieval code exists
  - Butler speculates that no issues exist
- `live_verified` evidence:
  - a human can see returned Issue list/detail data that matches GitHub state

### PR create/update

- Not enough:
  - Codex reports PR creation in a task summary
  - branch-local diff exists without a published PR
- `live_verified` evidence:
  - a human can see the GitHub PR or its updated state

### Review comment arrival

- Not enough:
  - reviewer code path exists
  - Butler says reviewer likely commented
- `live_verified` evidence:
  - a human can see the PR review comments on GitHub

### Butler synthesis over PR/review/CI truth

- Not enough:
  - synthesis code exists
  - Butler summarizes from stale or partial memory only
- `live_verified` evidence:
  - a human can see Butler summarize the current PR/review/CI state from
    GitHub-observable runtime truth

### Merge

- Not enough:
  - merge route exists
  - Butler says merge should be possible
- `live_verified` evidence:
  - a human can see the PR merged state on GitHub

### Issue close

- Not enough:
  - close logic exists
  - Butler says closure was attempted
- `live_verified` evidence:
  - a human can see the Issue closed state on GitHub

## Relationship To E2E Evidence

`live_verified` is the minimum completion floor for user-observable runtime
behavior.

Milestone completion still requires mapped E2E evidence and human closure
judgment. `live_verified` does not replace the Issue-to-E2E matrix.

## Forbidden Completion Claims

The following are prohibited:

- claiming completion from docs-only or code-only progress
- claiming GitHub state changed when only an internal task summary exists
- claiming absence of Issues/PRs/comments from unsupported or failed reads
- using "skeleton", "point solution", or similar partial wording as if it were
  completion
