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
6. Conversation
7. Ad hoc AI inference

For current state, runtime truth overrides memory.

## Retrieval Model

Retrieval should be hybrid:

- structured lookup first,
- semantic retrieval second,
- ordered history where sequence matters.

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
