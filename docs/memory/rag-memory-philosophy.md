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
