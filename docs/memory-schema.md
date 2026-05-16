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
- RAG checkpoint use: a compact memory savepoint captured before context
  compression, sleep, travel, implementation, or large investigation changes the
  active thread state
- Meaningful checkpoint use: record the operational judgment that source code
  cannot reconstruct later, including why a file was suspected, why an actor
  stopped, which hypothesis failed, what uncertainty remained, and what the
  next actor must not forget

### `temperature_note`
- Purpose: preserve user intent temperature such as urgency, preference, and
  avoidance direction
- Typical content: desired direction, avoid list, current emphasis

### `repair_case`
- Purpose: retain concrete failure and recovery knowledge
- Typical content: failure pattern, detected cause, successful repair
- Boundary: use `repair_case` only when the failure and recovery are known
  enough to be reused. Use `working_memory.failureReasoning` when the actor is
  still exploring a failure, stopping because of uncertainty, or preserving a
  rejected hypothesis before the repair is proven.

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

For a RAG checkpoint stored as `working_memory`, content should stay compact and
may include:

- `summary`
- `details`
- `checkpointReason`
- `thoughtLocation`
- `userTension`
- `origin`
- `user_words`
- `tension_note`
- `contextSourceQuality`
- `hypothesis`
- `explorationHypothesis`
- `suspectedFiles`
- `suspectedLines`
- `rejectedHypotheses`
- `stopReason`
- `uncertainty`
- `failureReasoning`
- `successPattern`
- `handoffMemory`
- `expectedFiles`
- `evidenceLinks`
- `previousRecordIds`
- `captureBoundary`
- `relatedIssue`
- `repository`
- `timestamp`

`captureBoundary` must describe the stored material as a judgment log or
operational summary, not raw hidden chain-of-thought or full transcript capture.

`origin` records where the memory candidate arose, such as `surface`,
`moment`, and `trigger`. It is provenance for recall, not authority.

`user_words` stores at most a few short owner utterances that help the owner
recognize the moment later. It must not be a transcript.

`tension_note` is a recall hook, not a personality evaluation. It may include
`summary`, `intensity`, `mode`, and `why_it_matters` so Butler, mac Codex, and
VPS Codex CLI can explain why the checkpoint mattered when the owner later asks
"あれなんだったっけ？".

Suggested `contextSourceQuality` values:

- `full_thread_context`: captured before compression from the active thread
- `compressed_context`: reconstructed after compression and requiring caution
- `external_evidence`: backed by Issue, PR, commit, log, or runtime truth
- `missing_context_risk`: known context loss risk remains

### Meaningful Checkpoint Content Fields

`meaningful memory` means a compact operational judgment record. It is not a
chat transcript, and it is not hidden chain-of-thought. It stores observable
decision context that future Butler, VPS Codex CLI, or mac Codex actors can use
to avoid drift:

- what was suspected,
- why it was suspected,
- what failed or worked,
- what was rejected,
- why the actor stopped,
- what uncertainty or tension mattered,
- where to inspect next time,
- what evidence or runtime truth anchored the checkpoint.

For exploration and file/line hypotheses, use:

```json
{
  "explorationHypothesis": {
    "summary": "The memory retrieval bug may live in operational ranking.",
    "whySuspected": "Repeated failures mention stale failure cases not being recalled.",
    "status": "open | confirmed | rejected | superseded | unknown",
    "suspectedFiles": ["src/core/operational-memory.js"],
    "suspectedLines": [
      {
        "file": "src/core/operational-memory.js",
        "lineStart": 210,
        "lineEnd": 260,
        "reason": "Ranking currently weights recurrence but not rejected hypotheses."
      }
    ],
    "actualRootCause": null
  }
}
```

`suspectedFiles` is a string array. `suspectedLines` is an array of objects with
`file` plus optional `line`, `lineStart`, `lineEnd`, and `reason`. These fields
are hypotheses, not proof. If the hypothesis is wrong, preserve it in
`rejectedHypotheses` instead of deleting the trail:

```json
{
  "rejectedHypotheses": [
    {
      "summary": "The stale branch incident was caused by provider query lag.",
      "whyRejected": "Runtime truth showed the branch pointer was wrong before provider query.",
      "evidence": "GitHub branch/ref check"
    }
  ]
}
```

For tension and stop capture, use structured objects:

```json
{
  "tension_note": {
    "summary": "Owner worried the implementation would look complete while Butler cannot use it.",
    "intensity": "high",
    "mode": "drift-prevention",
    "why_it_matters": "Future actors must verify Butler-facing reachability before completion claims."
  },
  "stopReason": {
    "summary": "Stopped before editing because Issue scope and runtime route did not match.",
    "authorityBoundary": "owner_decision_required"
  },
  "uncertainty": {
    "summary": "Unknown whether the Custom GPT Action Schema exposes the new field.",
    "unknowns": ["schema parity", "runtime payload storage"],
    "nextCheck": "Inspect OpenAPI and worker route before implementation."
  }
}
```

For failure and success reasoning, use:

```json
{
  "failureReasoning": {
    "whatFailed": "Butler could not reconstruct why a branch was abandoned.",
    "whyFailed": "The rejected file hypothesis was never persisted.",
    "whyMissed": "Only PR/runtime state was retained.",
    "inspectNextTime": "Look for rejectedHypotheses and suspectedLines before retrying."
  },
  "successPattern": {
    "whatWorked": "Retrieving failureReasoning before patch planning prevented repeat drift.",
    "whyWorked": "The actor saw the previous stop reason and avoided the same path.",
    "reuseConditions": ["same repository", "same Issue family", "runtime truth still current"],
    "hiddenConstraints": ["memory is background reference, not current truth"]
  }
}
```

`repair_case` may also include `failureReasoning`, `successPattern`, and
`rejectedHypotheses`, but only after the root cause and repair are known. While
the actor is still uncertain, keep the record as `working_memory` so retrieval
does not overstate it as a proven repair.

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
