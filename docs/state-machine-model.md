# VTDD v2 State Machine Model

This document defines the canonical workflow state machine for VTDD v2.
It covers only stages, events, and legal transitions. It does not define
policy judgment rules or issue/spec scope.

## Canonical Stages

- `idea`
- `proposal`
- `issue`
- `go`
- `build`
- `pr`
- `review`
- `merge`
- `reconcile_required`

## Canonical Events

- `draft_proposal`
- `canonicalize_issue`
- `grant_go`
- `start_build`
- `open_pr`
- `start_review`
- `request_changes`
- `approve_merge`
- `reset_to_proposal`
- `runtime_conflict_detected`
- `reconcile_completed`

## Immutable Forward Path

The canonical forward path is:

`idea -> proposal -> issue -> go -> build -> pr -> review -> merge`

This path may not be skipped.

## Allowed Backward Paths

The only canonical backward/reset paths are:

- `issue -> proposal` via `reset_to_proposal`
- `go -> proposal` via `reset_to_proposal`
- `build -> proposal` via `reset_to_proposal`
- `pr -> proposal` via `reset_to_proposal`
- `review -> build` via `request_changes`
- `review -> proposal` via `reset_to_proposal`

No other backward transition is canonical.

## Reconcile Boundary

When runtime truth conflicts with memory truth, the workflow moves to:

- `reconcile_required`

While in `reconcile_required`:

- all normal workflow events are blocked
- only `reconcile_completed` is allowed
- the state must remember `reconcileReturnStage`

When reconcile completes successfully, the workflow returns to the stored
`reconcileReturnStage` unless an explicit valid `returnStage` is provided.

## Non-goals

This model does not define:

- approval semantics
- consent semantics
- credential rules
- reviewer quality policy
- provider-specific runtime fetching
