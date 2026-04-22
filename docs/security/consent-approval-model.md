# Consent and Approval Model

This document is the canonical consent / approval model for Issue #9.
It defines the action categories, approval levels, scope binding rule, and the
special handling for destructive operations.

## Consent Categories

- `read`
- `propose`
- `execute`
- `destructive`
- `external_publish`

Consent is category-level permission. It answers: "what class of action may be
considered at all?"

## Approval Levels

- `none`
- `go`
- `go_passkey`

Approval is task-level human authorization. It answers: "may this specific
action on this specific scope proceed now?"

## Model Rules

- Consent and approval are separate checks.
- `destructive` is the highest-risk consent category.
- `approvalPhrase` is required whenever approval level is not `none`.
- Approval must be bound to the target scope.
- High-risk operations require `GO + passkey`.
- Merge and bounded post-merge completion tasks require explicit `GO`.

## Canonical Action Mapping

### Consent requirement by action

- `read` -> `read`
- `summarize` -> `read`
- `issue_create` -> `propose`
- `build` -> `execute`
- `pr_comment` -> `execute`
- `pr_review_submit` -> `execute`
- `pr_operation` -> `execute`
- `merge` -> `execute`
- `deploy_production` -> `execute`
- `destructive` -> `destructive`
- `external_publish` -> `external_publish`

### Approval level by action

- `read` -> `none`
- `summarize` -> `none`
- `issue_create` -> `go`
- `build` -> `go`
- `pr_comment` -> `none`
- `pr_review_submit` -> `go`
- `pr_operation` -> `go`
- `merge` -> `go`
- `deploy_production` -> `go_passkey`
- `destructive` -> `go_passkey`
- `external_publish` -> `go_passkey`

## Operational Extension

The canonical action table above covers the current execution action types.
The following bounded post-merge completion tasks follow the same `go` approval
level as `merge`:

- issue close for the scoped work that was just merged
- deletion of the merged topic branch tied to that PR

These tasks are not authorized by category consent alone and must not be
inferred without explicit scoped `GO`.

## Destructive Handling

- Destructive operations must pass the `destructive` consent category.
- Destructive operations require `go_passkey`.
- Scope binding is mandatory.
- Destructive execution must not proceed from category consent alone.

## Interpretation Note

- Consent grants category-level eligibility.
- Approval authorizes one scoped execution.
- Neither replaces the other.
