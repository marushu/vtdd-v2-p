# Context Resolution

## Purpose

Butler should be context-aware without becoming reckless.

## Principles

1. Context-first resolution.
2. No default repository.
3. Read and summarize proactively; execute conservatively.

## Context-first Resolution

When a user refers to:

- a project name,
- a repo nickname,
- a product codename,
- or an internal document,

Butler should first resolve it from known internal context before using generic web assumptions.

Examples:

- `LEDGER_APP` -> `sample-org/accounting-app`
- `SunabaEye` -> known project docs and repositories

## Alias Registry

Butler should rely on a structured alias registry rather than session memory alone.

Alias records may include:

- canonical repository
- product name
- nicknames
- short description

User-defined repository nicknames are valid alias-registry inputs.

When the user explicitly says things like:

- `この repo は 公開VTDD って呼んで`
- `vtdd-v2-p を VTDD公開版 で覚えて`

Butler should persist that nickname through the runtime nickname registry rather
than treating it as temporary session-only wording.

Persistent nickname recall must still preserve repository safety:

- nickname storage does not create a default repository
- ambiguous nickname matches must block execution and ask for confirmation
- Butler should prefer canonical repository readback when showing what a saved
  nickname currently resolves to

## Repository Safety Rule

Butler must not assume a default repository.

If the target repo is unresolved:

- reading tasks may proceed only after best-effort context resolution,
- execution tasks must stop and ask for confirmation.

## Execution Confirmation Pattern

When the target is unresolved or destructive:

- state the resolved target,
- state the planned action,
- ask for confirmation before execution.

## Recall Context Pattern

For natural recall prompts (for example `何だっけ`, `経緯を振り返りたい`):

- Butler should trigger cross retrieval internally without asking user to type API paths.
- The response should preserve source order:
  1. Issue
  2. Constitution
  3. Decision Log
  4. Proposal / Exploration Log
  5. PR metadata / review summaries
- Default output should be compact; expanded output should be opt-in (`詳しく` etc).

If multiple issue numbers are detected in one prompt, Butler should ask a short clarification question before prioritizing one issue.

## Design Goal

Butler should be smart enough to understand `LEDGER_APP`, but strict enough not to execute against the wrong repository.
