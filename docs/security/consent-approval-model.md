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

## GitHub Operation Matrix

The GitHub App may hold broad repository capabilities, but VTDD must still
separate "can execute" from "may execute now." The following matrix is the
canonical approval boundary for GitHub-side actions.

### `GO`

Bounded repository workflow operations may proceed with explicit scoped `GO`:

- branch creation for scoped work
- commit / push on the scoped topic branch
- PR creation, update, label, assignee, and review-response work
- PR comment and scoped review iteration
- merge, when scoped criteria, tests, and mapped E2E evidence are present
- post-merge issue close for the scoped work
- deletion of the merged topic branch tied to that scoped PR

### `GO + passkey`

High-risk or administration-bearing GitHub operations require explicit scoped
`GO + passkey`:

- production deploy or deploy-triggering repository operation
- repository / environment secret creation, update, or deletion
- repository / environment variable creation, update, or deletion
- GitHub App installation, token, credential, or permission mutation
- repository settings mutation
- ruleset, branch protection, environment protection, or merge-policy mutation
- collaborator / team / permission mutation
- repository archive, delete, transfer, visibility change, or equivalent
- destructive branch, tag, release, environment, or workflow mutation outside
  the bounded post-merge branch cleanup path
- external publish or externally visible integration enablement

### `Never Auto`

The following must never be inferred or auto-executed from repository state
alone, even when the GitHub App technically has the capability:

- milestone completion judgment
- issue closure without bounded scope linkage to the merged work
- repository administration or permission mutation without explicit high-risk approval
- destructive operation without explicit scoped `GO + passkey`
- broad cleanup outside the currently scoped branch / PR / issue window
- policy reinterpretation from "the app can do it" to "the app may do it now"

## Destructive Handling

- Destructive operations must pass the `destructive` consent category.
- Destructive operations require `go_passkey`.
- Scope binding is mandatory.
- Destructive execution must not proceed from category consent alone.

## Interpretation Note

- Consent grants category-level eligibility.
- Approval authorizes one scoped execution.
- Neither replaces the other.
