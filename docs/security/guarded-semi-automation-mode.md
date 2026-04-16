# Guarded Semi-Automation Mode

This document defines the canonical guarded semi-automation mode for Issue #75.
The goal is to let VTDD progress while the operator is away, without allowing
ambiguous or high-risk execution.

## Modes

- `normal`
  - standard execution policy flow
  - high-risk actions still require `GO + passkey`
- `guarded_absence`
  - constrained autopilot mode for operator absence
  - execution is allowed only for explicitly low-risk operations
  - ambiguous or conflicted requests must stop

## Switch and Return Conditions

### Enter guarded absence mode

Set Worker runtime env:

- `VTDD_AUTONOMY_MODE=guarded_absence`

Legacy alias is still accepted:

- `MVP_AUTONOMY_MODE=guarded_absence`

### Return to normal mode

Set either:

- `VTDD_AUTONOMY_MODE=normal`
- unset both `VTDD_AUTONOMY_MODE` and `MVP_AUTONOMY_MODE`

If runtime forces `guarded_absence`, request payload override is ignored.

## Allowed and Forbidden Operations in `guarded_absence`

### Allowed

- `read`
- `summarize`
- `issue_create`
- `build`
- `pr_comment`
- `pr_operation` (for draft/update operation only; merge remains forbidden)

### Forbidden

- `pr_review_submit`
- `merge`
- `deploy_production`
- `destructive`
- `external_publish`

High-risk actions remain forbidden in guarded absence mode even if `GO + passkey`
is present.

## Mandatory Stop Boundaries in `guarded_absence`

Execution must stop when any of the following is true:

- ambiguous request (`ambiguity.ambiguousRequest=true`)
- spec conflict (`ambiguity.specConflict=true`)
- target is not confirmed (`targetConfirmed=false` or `ambiguity.targetUnconfirmed=true`)
- one-issue/one-PR boundary is violated (`issuePrCount > 1`)

## Execution Log Requirement

Every `/v2/gateway` execution in `guarded_absence` must produce an
`execution_log` entry containing at least:

- attempted action type
- whether execution was allowed/blocked
- stop rule and reason (when blocked)
- repository input and resolved repository
- timestamp

This enables post-absence traceability for "what ran" and "why it stopped".

## GitHub Enforcement Pack (Required Guard Combination)

Guarded mode is not complete with AGENTS.md only.
Use AGENTS.md + repository settings + checks:

1. Branch protection on `main`
2. Required status checks:
   - `guarded-autonomy-required-checks / guarded-policy`
   - `guarded-autonomy-required-checks / test`
3. Required review gate:
   - at least one human reviewer
   - code owner review required (`.github/CODEOWNERS`)

If branch protection or rulesets cannot be enabled due plan limits, treat this
as an explicit residual risk and do not claim guarded mode as fully enforced.
