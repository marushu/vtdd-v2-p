# VTDD MCP Version Architecture

This document is the canonical architecture contract for Issue `#318`.

It defines how VTDD moves toward an MCP-backed multi-surface system without
changing the North Star, downscoping capability, or replacing governance with
raw tool calls.

## North Star

VTDD is an AI development governance layer that lets the owner drive
Issue-first development from natural language while preserving:

- runtime truth
- structured operational memory
- approval boundaries
- auditability
- reviewer blocking signals
- evidence-backed completion judgment

MCP is an interface layer inside that system. MCP is not the source of truth,
the source of authority, or the replacement for Butler.

## Primary Goal

The immediate MCP goal is:

`Butler stays in place while Mac Codex and VPS Codex CLI can read the same memory, runtime truth, review truth, and implementation recall.`

The system must answer the same repository / Issue / PR questions across these
three surfaces.

## Surface Model

### Butler

- entry surface: Custom GPT Action Schema
- current transport: `/v2/action/*` and `/v2/retrieve/*`
- current role: owner-facing natural-language governance surface

### Mac Codex

- entry surface: MCP client
- target transport: `/mcp`
- current role: local coding / inspection / debugging / recall

### VPS Codex CLI

- entry surface: MCP client plus existing remote execution paths
- target transport: `/mcp`
- current role: remote coding / inspection / execution / recall

## Control Plane

The shared VTDD control plane is:

```text
Butler (Action Schema) ---------\
Mac Codex (MCP) --------------- +--> VTDD core
VPS Codex CLI (MCP) -----------/

VTDD core
  - issue-first scope
  - runtime truth
  - structured operational memory
  - review truth
  - implementation recall
  - approval boundary
  - audit
```

The surface changes. The control plane does not.

## Core Rule

Do not fork business logic by surface.

The same repository / Issue / PR must map to the same:

- memory record families
- runtime truth model
- reviewer truth model
- capability boundary
- implementation recall output

If Butler, Mac Codex, and VPS Codex CLI return different answers for the same
target, the architecture is incomplete.

## Shared Truth Layers

### Runtime Truth

Runtime truth is current observable state such as:

- repository resolution
- Issue body / state
- PR state / mergeability / draft/open
- checks and workflow state
- reviewer signals
- execution progress
- deploy state

Runtime truth always outranks historical memory for current state.

### Structured Operational Memory

Structured memory remains the same VTDD memory family model:

- `working_memory`
- `execution_log`
- `proposal_log`
- `approval_log`
- `decision_log`
- `repair_case`
- `constitution`
- `temperature_note`

The MCP version must not replace this with chat-history memory.

### Review Truth

Review truth must combine:

- GitHub formal reviews
- VTDD reviewer marker comments
- Codex fallback reviewer markers
- request_changes / manual_review / approve state
- next safe actions

It must remain distinct from generic PR state.

### Implementation Recall

Implementation recall is the shared answer to:

`あれどうやって実装したっけ？`

It must return:

- repository
- related Issue
- related PR
- commits
- changed files
- tests
- E2E evidence
- decisions
- reviewer objections and resolutions
- current runtime state or stale warning

## Canonical Retrieval Contracts

The first MCP-facing canonical contracts are:

### `vtdd_runtime_truth`

Returns current repository / Issue / PR / execution / deploy truth.

### `vtdd_review_truth`

Returns reviewer state, blocking state, evidence links, and next safe action.

### `vtdd_search_operational_memory`

Returns compact, structured memory references without dumping transcripts.

### `vtdd_recall_implementation`

Returns shared implementation recall.

Required output shape:

```json
{
  "repository": "owner/repo",
  "issueNumber": 318,
  "pullNumber": 999,
  "commits": ["sha"],
  "files": ["path/file.js"],
  "tests": ["node --test ..."],
  "evidence": ["docs/path.md", "check url"],
  "decisions": ["decision summary"],
  "reviewerResolutions": ["request_changes response summary"],
  "runtimeStatus": "merged | open_pr | stale | unknown"
}
```

### `vtdd_pr_status`

Returns PR state using the same runtime/review truth model used by Butler.

### `vtdd_issue_status`

Returns Issue intent, success criteria, non-goals, linked PRs, and blockers.

## Authority Model

MCP must not create a separate weaker or stronger governance model.

The same operation classes apply regardless of surface:

### Read

- repository / Issue / PR status
- review truth
- runtime truth
- memory recall

### Draft

- issue draft
- PR comment proposal
- summary / recommendation draft

### Write

- issue create
- comment create
- PR update
- ready-for-review transition

### Dangerous

- merge
- deploy
- credential mutation
- permission mutation
- destructive external changes

High-risk operations remain `GO + passkey`.

Butler, Mac Codex, and VPS Codex CLI must converge on the same capability
registry. MCP is not permanently read-only. It simply must not skip governance.

## Entry Surface Strategy

### Butler Stays As-Is

Butler continues to use Action Schema as its surface.

The Butler path remains:

```text
Butler -> Action Schema -> VTDD core
```

### Mac / VPS Move To MCP

Mac Codex and VPS Codex CLI gain:

```text
Mac Codex -> MCP -> VTDD core
VPS Codex CLI -> MCP -> VTDD core
```

This creates shared read and recall first without replacing Butler.

## Execution Harness Boundary

Current VPS execution is a user-owned Codex CLI process wrapper.

It is not the same thing as Codex App Server / exec-server.

The MCP version must preserve that distinction and investigate separately
whether Codex App Server / exec-server can replace or augment the current
remote execution harness.

That investigation must not block shared memory / truth convergence.

## Asset Mapping

### Keep As Core

- runtime truth model
- operational memory schema/provider contract
- approval model
- reviewer truth synthesis
- Issue-first execution
- PR evidence discipline

### Expose Through MCP

- runtime truth retrieval
- review truth retrieval
- operational memory retrieval
- implementation recall
- Issue / PR status retrieval

### Keep Action Schema Only For Now

- Butler natural-language surface
- current owner-facing iPhone flow

### Investigate Separately

- Codex App Server / exec-server harness
- broader design / marketing / web tool adapters

## Migration Principle

Migration is side-by-side, not big-bang.

```text
Current:
Butler -> Action Schema -> VTDD core

Add:
Mac/VPS -> MCP -> same VTDD core
```

The system is only healthier if all three surfaces converge on the same
contracts.

## Success Condition For This Architecture

The MCP version is on-track when:

- Butler can remain unchanged as a surface
- Mac Codex can query shared VTDD truth through MCP
- VPS Codex CLI can query shared VTDD truth through MCP
- all three surfaces can answer the same repository / Issue / PR questions
- implementation recall no longer depends on local chat history
- memory does not override runtime truth
- dangerous actions remain governed

## Explicit Non-Goals

- replacing Butler with MCP
- big-bang rewrite
- exposing dangerous actions directly through raw MCP calls
- storing full chat transcripts as memory
- using owner-specific runtime URLs or credentials as public architecture
