# RAG / Memory Philosophy

## Position

RAG is not a convenience feature in VTDD V2.
It is core infrastructure for repeatable judgment.

## Intent

VTDD V2 should preserve enough structured memory to recover context, explain decisions, and avoid re-litigating the same reasoning every session.

## Core Principles

1. RAG is core, not optional.
2. AI understanding is not a sufficient safety base.
3. Memory and runtime truth must remain distinct.
4. Canonical spec and background context must not be mixed.
5. Provider implementation must remain replaceable.

## Memory Layers

- Constitution
- Decision Log
- Working Memory
- Temperature Notes
- Repair Cases
- Proposal / Exploration Log
- Alias / Project Registry

## Truth Hierarchy

During execution, the strongest sources are:

1. Issue
2. Constitution
3. Runtime truth
4. Decision Log
5. Proposal / Exploration
6. PR metadata / review summaries
7. Conversation
8. Ad hoc AI inference

For current state, runtime truth overrides memory.

## Retrieval Model

Retrieval should be hybrid:

- structured lookup first,
- semantic retrieval second,
- ordered history where sequence matters.

Cross retrieval should keep this minimum source set:

- Issues (current spec context)
- Constitution rules
- Decision logs
- Proposal / exploration logs
- PR metadata / review summaries

Semantic retrieval should be attached through provider-agnostic query adapters and
must not replace structured lookup order.

## Retrieval Quality Metrics

When semantic assistive mode is enabled, track quality by use case:

- recall context
- similar issue discovery
- decision rationale lookup

For each use case, define:

- precision@3 and precision@5
- recall@5 and recall@10
- baseline: structured-only
- comparison target: structured + semantic assistive

## Storage Principle

Common specifications and public system definitions belong in Git.
User state, memory, aliases, and logs belong in secure database-backed storage.

## Safety Rule

Do not store:

- tokens,
- private keys,
- raw secrets,
- unnecessary full casual chat history.

Store only what improves future judgment and recovery.

## Retention and Pruning Principle

- Prefer selective structured capture at write time over full transcript capture.
- Apply filtering before storage to control long-term storage and retrieval cost.
- Temporary full-log capture is allowed only with explicit owner approval and
  must define:
  - Issue linkage,
  - retention TTL,
  - deletion plan.
- Proposal/decision/execution records should remain compact and referenceable
  rather than transcript-heavy.

## Meaningful Memory Principle

Meaningful memory is operational judgment memory. It preserves the parts of a
VTDD run that are important for future reconstruction but are not recoverable
from source code, Issues, PR status, or runtime truth alone.

Store meaningful memory when the actor has learned something about:

- a failure, including why it failed, why it was missed, and where to inspect
  next time,
- a success pattern, including why it worked, when it is reusable, and hidden
  constraints,
- an exploration hypothesis, including suspected files, suspected lines, and
  why those locations were suspicious,
- a rejected hypothesis, including why it was plausible and why it was later
  rejected,
- tension, stop reason, uncertainty, or operational fear that changes how the
  next actor should proceed,
- handoff state that Butler, VPS Codex CLI, and mac Codex must share.

Do not store meaningful memory merely because text exists. Store it because the
record will reduce future drift, shorten reconstruction, explain a stop, or
prevent a known failure from repeating.

## Failure Map

A failure map is the retrieval-facing view of meaningful failure memory. It
should answer:

- what failed,
- why it failed,
- why it was missed,
- which hypotheses were rejected,
- what stop reason or uncertainty blocked continuation,
- where the next actor should inspect first.

The failure map is background evidence. Runtime truth still wins for current
state, and an unresolved failure map must not be presented as a proven
`repair_case`.

## Exploration Memory

Exploration memory captures the shape of investigation before the root cause is
known. It should keep file/line hypotheses durable without pretending they are
true.

Use `working_memory` for active or uncertain exploration. Record:

- `explorationHypothesis.summary`
- `explorationHypothesis.whySuspected`
- `explorationHypothesis.status`
- `suspectedFiles`
- `suspectedLines`
- `rejectedHypotheses`
- `actualRootCause` when it becomes known

An "外した仮説" is still valuable memory. It prevents the next actor from
rerunning the same wrong path and explains why a workaround, stop, or branch
abandonment happened.

## RAG Checkpoint Principle

A RAG checkpoint is VTDD's memory savepoint. It is closer to pressing `Cmd+S`
during a fragile creative session than to writing a polished final report.

Capture small checkpoints when:

- the owner says or implies "this is important",
- strong tension, concern, anger, relief, or excitement changes the decision
  context,
- an implementation hypothesis or expected file set appears,
- a dry-run finds a likely breakage point,
- an error deserves observation before repair,
- a large docs / PR / log investigation begins or ends,
- context compression appears likely or has just happened,
- the owner is about to sleep, bathe, travel, or otherwise lose the active
  mental thread.

The checkpoint should store a compact judgment log:

- what was noticed,
- why it matters,
- where it came from,
- the owner's tension at that moment,
- related Issue / PR,
- expected files or hypotheses,
- rejected hypotheses,
- suspected file/line ranges,
- stop reason and uncertainty,
- evidence links when available,
- whether the source context was full, compressed, externally verified, or
  risky.

Do not store raw full transcripts or hidden chain-of-thought as checkpoints.
If a checkpoint is created after compression, mark it as lower-trust
`compressed_context` or `missing_context_risk` until Issue / PR / runtime
evidence verifies it.

## Shared Checkpoint Semantics

Butler, VPS Codex CLI, and mac Codex must treat a checkpoint the same way:

- natural owner intent is converted into a structured `working_memory`
  checkpoint candidate,
- the candidate is shown before write when owner approval is required,
- write uses the same `vtddWriteOperationalMemory` runtime contract where
  available,
- retrieval confirms through `vtddRetrieveOperationalMemory`, not only
  cross-memory decision/proposal retrieval,
- direct database writes remain an operator repair path, not the normal shared
  checkpoint flow.
