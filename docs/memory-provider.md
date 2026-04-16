# VTDD V2 Memory Provider Interface

This document is the canonical memory provider interface for Issue #3.
It defines the minimum provider contract required by VTDD runtime.

## Required Methods

Every memory provider must expose these methods:

### `store(input)`
- Purpose: persist a single `MemoryRecord`
- Input: candidate memory record object
- Output on success:

```json
{
  "ok": true,
  "record": {}
}
```

- Output on validation failure:

```json
{
  "ok": false,
  "issues": ["..."]
}
```

### `retrieve(filter = {})`
- Purpose: retrieve records by structured filter
- Supported filter fields:
  - `type`
  - `limit`
  - `tags`
- Output: array of matching records
- Ordering: highest `priority` first, then newest `createdAt`

### `query(input = {})`
- Purpose: text-oriented retrieval over stored records
- Supported input fields:
  - `text`
  - `type`
  - `limit`
- Output: array of matching records
- Ordering: highest `priority` first, then newest `createdAt`

### `validateRecord(input)`
- Purpose: validate a candidate record against the memory schema without
  storing it
- Output:

```json
{
  "ok": true
}
```

or

```json
{
  "ok": false,
  "issues": ["..."]
}
```

## Interface Notes

- Providers must accept the shared `MemoryRecord` shape from
  `docs/memory-schema.md`.
- Providers may use different storage backends internally, but the contract
  seen by VTDD must remain stable.
- `retrieve` is for deterministic structured retrieval.
- `query` is for text search or semantic-style lookup behavior.
- `validateRecord` must not mutate storage.

## Minimum Runtime Expectation

VTDD runtime assumes that:
- provider validation exists
- deterministic retrieve exists
- text-oriented query exists
- store validates before persistence
