# VTDD v2 Issue-as-Spec Model

This document defines the canonical execution rule that the Issue is the
only implementation spec during execution phase.

## Phase Separation

### Exploration Phase

- discussion with Butler
- ambiguity is allowed
- proposals and alternatives may be explored
- implementation is not performed

### Execution Phase

- the Issue is the only implementation spec
- guessing, supplementing, and "while here" implementation are not allowed
- any out-of-scope improvement may be proposed, but not implemented

## Source-of-Truth Order During Execution

1. Issue
2. Constitution
3. Runtime Truth

## Canonical Traceability Fields

- `intentRefs`
- `successCriteriaRefs`
- `nonGoalRefs`
- `outOfScopeChanges`
- `outOfScopeProposedOnly`

Execution must trace to at least one of:

- `intentRefs`
- `successCriteriaRefs`
- `nonGoalRefs`

## Out-of-Scope Rule

If `outOfScopeChanges` is non-empty, execution is blocked unless:

- `outOfScopeProposedOnly` is `true`

This means Issue-external ideas may be recorded as proposals, but they may
not be silently implemented during execution.

## Non-goals

This model does not define:

- issue template wording
- PR template wording
- review quality heuristics
- implementation method
