# VTDD V2 Overview

## Purpose

VTDD V2 is not a finished product.
VTDD V2 is a development operating system that keeps judgment stable while its surfaces, providers, and tools evolve.

VTDD V2 does not depend on AI "understanding" alone.
It externalizes structure, memory, approval boundaries, and runtime truth so that every session can return to the same judgment basis.

## Current Reading

As of 2026-04-17, VTDD V2 is **partial / in-progress**.
The repository has broad runtime and contract coverage, but overall completion still depends on mapped E2E evidence and human closure judgment.
`live_verified` in this repository means human-observable external evidence, not
just local files, docs, task summaries, or internal runtime flags.

## Core Principles

1. Constitution-first judgment.
2. Issue is the canonical spec during execution.
3. Runtime truth is stronger than memory for current state.
4. Proposal and execution must remain separate.
5. Human approval boundaries are sacred.
6. RAG is core infrastructure, not an optional helper.
7. Providers and surfaces must be replaceable.

## What VTDD V2 Is

- A governance layer for development work.
- A memory-backed decision system.
- A role-separated operating structure for Butler, executor, and reviewer.
- An iPhone-first, editor-optional development experience.

## What VTDD V2 Is Not

- A single AI product.
- A single UI.
- A single cloud provider.
- A system that assumes AI hallucination disappears.
- A system that allows "I fixed it while I was there" implementation drift.
- A system that requires GitHub Pro as an MVP prerequisite.

## Core Building Blocks

- Constitution
- Issue-as-spec
- Proposal / GO / execution boundary
- Runtime truth and reconcile policy
- Memory / retrieval / decision trace
- Approval model
- Alias / repository resolution
- Butler / executor / reviewer role separation
- GitHub App credential boundary
- machine-auth gateway and retrieval runtime

## User Experience Goal

VTDD V2 should let a user:

- think through Butler,
- shape ideas into Issues,
- execute through governed approval,
- review and deploy from mobile devices,
- recover context after interruption,
- and keep using familiar product names like `LEDGER_APP` without losing precision.

## Platform Principle

VTDD V2 may start with:

- ChatGPT Custom GPT
- GitHub
- Cloudflare
- Gemini reviewer

But none of these define the essence of VTDD V2.

## Operational Direction

- memory-first, but secrets stay out of memory
- GitHub-first, but non-lock-in
- context-first Butler judgment
- alias/context-first repository resolution
- no default repository
- unresolved target blocks execution
- high-risk actions require `GO + passkey`
- reviewer is a blocking risk signal, not an executor
- mobile-first operation should not require pasting secrets into chat answers

## One Line

VTDD V2 is a memory-backed, approval-governed development OS that keeps judgment stable while tools and surfaces remain replaceable.
