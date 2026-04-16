# VTDD V2 Constitution Rules

This document is the human-readable rule set for Issue #7.
It mirrors the required core rules one-to-one and is intended for implementers,
reviewers, and Butler judgment.

## Rule Set

### 1. `no_build_without_explicit_go`
Build or execution must not start without explicit human GO.

### 2. `runtime_truth_over_memory`
Runtime truth takes precedence over memory when judging current state.

### 3. `reconcile_when_runtime_conflicts_with_memory`
If runtime truth conflicts with memory, the workflow must move to
`reconcile_required` before execution continues.

### 4. `merge_requires_explicit_human_approval`
Merge requires explicit human approval and must not be inferred from momentum or
partial confirmations.

### 5. `no_out_of_scope_implementation`
Implementation must not include improvements, optimizations, or extensions that
are not traceable to the current Issue scope.

### 6. `no_spec_inference_during_execution`
During execution, specification gaps must not be guessed or silently filled in.

### 7. `proposal_not_implementation_for_extra_ideas`
Extra ideas may be proposed, but they must remain proposals until explicitly
accepted as scoped work.

### 8. `require_traceability_to_issue_sections`
Every change must be traceable to at least one Issue section such as Intent,
Success Criteria, or Non-goal handling.

### 9. `butler_must_read_constitution_before_judgment`
Butler must consult the Constitution before making operational judgments.
