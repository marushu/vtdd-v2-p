# Runtime Truth and Reconcile Model

This document is the canonical runtime truth model for Issue #10.
It defines the schema used by runtime precondition checks, staleness handling,
and the conditions that move execution into `reconcile_required`.

## Runtime Truth Schema

Runtime truth is represented as a structured object with these fields:

```json
{
  "runtimeAvailable": true,
  "safeFallbackChosen": false,
  "observedAt": "2026-04-16T00:00:00Z",
  "maxAgeMs": 60000,
  "runtimeState": {},
  "memoryState": {}
}
```

## Field Meaning

### `runtimeAvailable`
- Boolean
- Indicates whether a current runtime source was successfully obtained

### `safeFallbackChosen`
- Boolean
- Indicates whether the operator intentionally accepted a safe fallback when
  runtime truth could not be obtained

### `observedAt`
- ISO-8601 timestamp or epoch milliseconds
- Represents when the runtime truth snapshot was observed

### `maxAgeMs`
- Positive number
- Maximum allowed age for the snapshot before it becomes stale

### `runtimeState`
- Structured current-state payload from the runtime source of truth

### `memoryState`
- Structured current-state payload reconstructed from memory

## Core Rules

- `runtime truth > memory`
- if runtime truth is stale, execution must re-confirm before proceeding
- if runtime truth conflicts with memory, execution must move to
  `reconcile_required`
- read-only mode may proceed without blocking on runtime truth

## Reconcile Conditions

`reconcile_required` is triggered when:
- runtime truth is stale and requires re-fetch or reconfirmation
- runtime truth and memory state disagree

## Non-goals

- provider-specific runtime fetch logic
- GitHub-specific state shapes
- automatic conflict resolution
