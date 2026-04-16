# VTDD V2 Memory Schema

This document is the canonical memory schema for Issue #2.
It defines the required core memory record families, the shared `MemoryRecord`
shape, and the policy for `metadata`, `priority`, and `tags`.

## Required Core Record Families

These families are required by Issue #2 and form the core VTDD memory model.

### `constitution`
- Purpose: store canonical governance rules and constitutional references
- Typical content: rule set, constitution version, canonical pointers

### `decision_log`
- Purpose: record decisions that must survive session changes
- Typical content: decision, rationale, scope, supersedes / supersededBy

### `working_memory`
- Purpose: keep short-lived but operationally useful context
- Typical content: current risk, pending ambiguity, active constraints

### `temperature_note`
- Purpose: preserve user intent temperature such as urgency, preference, and
  avoidance direction
- Typical content: desired direction, avoid list, current emphasis

### `repair_case`
- Purpose: retain concrete failure and recovery knowledge
- Typical content: failure pattern, detected cause, successful repair

## Operational Extension Record Families

The runtime may define additional operational record families beyond the Issue
#2 core set. Current extensions include:

- `proposal_log`
- `approval_log`
- `execution_log`
- `alias_registry`

These are valid runtime memory records, but they do not replace the required
core families above.

## Shared `MemoryRecord` Shape

All memory records use the following shape:

```json
{
  "id": "string",
  "type": "constitution | decision_log | working_memory | temperature_note | repair_case | ...",
  "content": {},
  "metadata": {},
  "priority": 50,
  "tags": ["example"],
  "createdAt": "2026-04-16T00:00:00Z"
}
```

## Field Policy

### `id`
- Required
- Stable identifier for a memory record

### `type`
- Required
- Must be one of the runtime-supported memory record types
- The five required core families must always remain supported

### `content`
- Required
- Structured payload for the record's primary meaning
- Content shape may vary by `type`

### `metadata`
- Required object
- Carries indexing, provenance, and routing data
- Must not contain secrets or raw credentials
- Examples:
  - `source`
  - `issue`
  - `version`
  - `surface`

### `priority`
- Required integer from `0` to `100`
- Higher number means stronger retrieval priority
- Suggested default is `50`
- Suggested interpretation:
  - `80-100`: constitutional or high-governance relevance
  - `60-79`: active operational context
  - `40-59`: normal reference value
  - `0-39`: weak or archival relevance

### `tags`
- Required string array
- Used for retrieval filtering and lightweight grouping
- Tags should be short, stable, and operationally meaningful

### `createdAt`
- Required ISO-8601 timestamp
- Represents creation time of the record

## Safety Notes

- Memory schema defines shape, not permission by itself.
- Whether a record may be stored is additionally constrained by memory safety
  policy.
- Canonical shared spec still belongs in Git; memory is not allowed to replace
  Git as the source of truth for shared specification.
