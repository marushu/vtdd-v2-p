# Operational Memory Layer

This document is the Issue #249 architecture contract for Butler operational
memory. It extends the existing memory schema and provider contracts without
creating Cloudflare resources or replacing runtime truth.

## Intent

Butler memory is persistent operational cognition, not generic chat history.
The layer exists to preserve durable judgment context across conversations,
repositories, and execution sessions while keeping current runtime truth
separate from historical memory.

## Layers

### Layer 1: Immediate Context

- Scope: current conversation and runtime input
- Storage: ephemeral runtime input
- Role: highest-precedence current context
- Persistence: not persisted by this layer
- Retrieval shape: returned as `runtimeTruth` and the reserved
  `referencesByLayer.immediate_context` bucket; it is not fetched from the
  memory provider and must not be written as generic chat history.

### Layer 2: Active Operational Memory

- Scope: recent issues, PRs, blockers, executions, reviews, approvals, and
  working state
- Storage contract: `memory_provider`
- Record families: `working_memory`, `execution_log`, `proposal_log`,
  `approval_log`
- Role: preserve current handoff, active blocker, and review context

### Layer 3: Long-Term Operational Memory

- Scope: historical failures, remediation, governance philosophy, recurring
  pain, rejected approaches, and operational preferences
- Storage contract: `memory_provider`
- Record families: `constitution`, `decision_log`, `repair_case`,
  `temperature_note`
- Role: preserve operational continuity across sessions and repositories

### Layer 4: Semantic Operational Patterns

- Scope: cross-project heuristics, preferred workflows, disliked operational
  patterns, successful orchestration approaches, review patterns, CI instability
  history, and proposal history
- Storage contract: `memory_provider.query`
- Record families: `decision_log`, `repair_case`, `proposal_log`,
  `execution_log`
- Role: retrieve relevant operational patterns without replacing structured
  lookup or runtime truth

## Storage Candidates

The architecture remains provider-agnostic. Valid storage candidates are:

- Cloudflare D1
- Cloudflare Vectorize
- Cloudflare R2
- Durable Objects

This contract does not require provisioning any of them. Runtime code should
continue to depend on the memory provider interface.

## Retrieval Contract

Operational memory retrieval must return compact references, not a full memory
dump. Ranking uses:

- relevance to the current request
- recency
- governance importance
- recurrence
- operational risk
- reconstruction value

The output must preserve the distinction between:

- current runtime truth, which can override historical memory for current state
- memory references, which are background operational evidence

## Meaningful Memory Retrieval Rules

Operational retrieval should surface meaningful memory when it helps the next
actor reconstruct judgment, avoid repeated failure, or reuse a proven success
pattern.

Failure memory is exposed as a `failureMap` on compact references when the
record contains failure reasoning, rejected hypotheses, stop reason, or
uncertainty. The failure map is especially relevant for stale branch incidents,
actor identity failures, pickup-not-observed cases, and other repeated
operational failures.

Success memory is exposed as `successPattern` when a record explains what
worked, why it worked, reuse conditions, and hidden constraints. Retrieval may
rank it higher when the query matches those reuse conditions, but runtime truth
still decides current state.

Exploration memory is exposed as `explorationHypothesis`, with suspected files
and suspected lines. Rejected hypotheses remain retrievable because knowing
what was wrong is part of drift prevention.

Tension and stop memory is exposed as `tension` and `failureMap.stopReason` /
`failureMap.uncertainty`. These fields are recall hooks for operational
judgment, not personality analysis.

## Non-Goals

- generic chatbot memory
- unrestricted autonomous execution
- personality simulation

## Runtime Entry Point

`retrieveOperationalMemory(provider, input)` implements this contract in
`src/core/operational-memory.js`.

The function returns:

- the four-layer architecture
- compact ranked references
- optional `explorationHypothesis`, `failureMap`, `successPattern`, `tension`,
  and `handoffMemory` fields on references when present
- references grouped by layer
- score signals for relevance, recency, governance importance, and recurrence
- score signals for operational risk and reconstruction value
- an explicit memory-use rule that prevents memory from overriding runtime truth

## Operator Bridge

`scripts/vtdd-memory.mjs` provides the shared-memory operator bridge for Issue
#251. It lets Mac Codex and VPS Codex CLI inspect or write structured memory
records while preserving the same schema, memory-safety checks, and runtime
truth boundary described here.

The bridge is documented in `docs/memory/vtdd-memory-bridge.md`. It must not be
used to store full chat transcripts, secrets, or owner-specific runtime
configuration in Git.
