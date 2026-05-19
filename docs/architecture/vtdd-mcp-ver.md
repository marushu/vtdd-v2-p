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

High-risk operations remain governed by scoped passkey approval.

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

## Canonical Codex MCP Connection

Mac Codex and VPS Codex CLI use the VTDD MCP endpoint directly.

Required environment:

- `VTDD_MCP_TOKEN`: bearer token for the VTDD MCP surface when auth is enabled

Canonical add command shape:

```bash
export VTDD_MCP_TOKEN=...
codex mcp add vtdd --url https://your-vtdd-runtime.example.com/mcp --bearer-token-env-var VTDD_MCP_TOKEN
```

Canonical `codex exec` config shape:

```bash
export VTDD_MCP_TOKEN=...
codex exec \
  --ignore-user-config \
  -c 'mcp_servers.vtdd.url="https://your-vtdd-runtime.example.com/mcp"' \
  -c 'mcp_servers.vtdd.bearer_token_env_var="VTDD_MCP_TOKEN"' \
  -c 'mcp_servers.vtdd.default_tools_approval_mode="approve"' \
  -c 'mcp_servers.vtdd.tools.vtdd_runtime_truth.approval_mode="approve"' \
  -s read-only \
  -C /path/to/repo \
  'vtdd MCP を使って runtime truth を返して。JSONそのまま。'
```

`codex exec` では raw MCP tool call の approval が `request_user_input` に
流れるため、approval mode を明示しないと
`user cancelled MCP tool call` で止まることがある。

The canonical VTDD Codex path therefore includes explicit MCP approval config
for trusted read tools on both Mac Codex and VPS Codex CLI.

Local verification shape:

```bash
export VTDD_MCP_TOKEN=vtdd-local-test
codex mcp add vtdd-local --url http://127.0.0.1:8788/mcp --bearer-token-env-var VTDD_MCP_TOKEN
codex exec \
  --ignore-user-config \
  -c 'mcp_servers.vtdd-local.url="http://127.0.0.1:8788/mcp"' \
  -c 'mcp_servers.vtdd-local.bearer_token_env_var="VTDD_MCP_TOKEN"' \
  -c 'mcp_servers.vtdd-local.default_tools_approval_mode="approve"' \
  -c 'mcp_servers.vtdd-local.tools.vtdd_runtime_truth.approval_mode="approve"' \
  -s read-only \
  -C /path/to/repo \
  'vtdd-local MCP を使って、marushu/vtdd-v2-p の runtime truth を JSON そのままで返して。説明不要。'
```

The MCP runtime must expose bearer-token discovery hints that let Codex resolve
the protected resource and connect without inventing a parallel OAuth flow.

## Live Parity Verification

Mac Codex と VPS Codex CLI は、接続できるだけでは不十分である。

同じ repository / Issue / PR に対して、同じ shared truth を返すことを
確認する必要がある。

Canonical parity targets:

- `vtdd_runtime_truth`
- `vtdd_review_truth`
- `vtdd_recall_implementation`

Canonical parity prompts:

```text
vtdd MCP を使って、marushu/vtdd-v2-p の runtime truth を JSON そのままで返して。説明不要。
```

```text
vtdd MCP を使って、marushu/vtdd-v2-p の PR #328 の review truth を JSON そのままで返して。説明不要。
```

```text
vtdd MCP を使って、marushu/vtdd-v2-p の Issue #318 の implementation recall を JSON そのままで返して。説明不要。
```

Mac Codex と VPS Codex CLI で比較する最小項目:

- repository
- issue / pull request target
- sourceOfTruth / runtimeStatus
- blocking review state
- next safe action
- files / tests / evidence references

Parity is not complete unless both surfaces can answer the same target with
materially matching truth.

If one surface succeeds and the other does not, record that as:

- connection established but parity incomplete

Do not describe one-sided success as shared-memory/shared-truth completion.

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
