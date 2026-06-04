# Dashboard Butler app-server live path

Issue: #450

## Decision

Dashboard Butler is a separate live chat path. It is not a thin UI over the
Custom GPT Action path, and it is not a WebSocket wrapper around one-shot
`codex exec` jobs.

Dashboard Butler is also not a lightweight AI replacement inside the Worker.
The Worker / Durable Object layer is a relay, storage, auth, recovery, and
authority-boundary surface. For ordinary owner chat, including cost questions,
PR / Issue status questions, and repo-less main chat, the message must reach the
VPS Dashboard Bridge / `codex app-server` path when the bridge is connected.
Worker-side deterministic replies must not pretend to answer as Butler or stop
the turn only to save Codex usage.

The Dashboard Butler implementation target is:

```text
Dashboard Butler PWA
  -> Worker / Durable Object dashboard chat room
  -> VPS Dashboard Bridge
  -> codex app-server
  -> live Codex thread / turn / event stream
  -> Dashboard chat thread
```

The fallback surface is the existing Custom GPT Butler.

`codex exec` is not the Dashboard Butler fallback. It may remain useful for
bounded non-interactive automation elsewhere, but it must not be used to claim
Dashboard Butler live chat completion.

## Why this is required

The Dashboard path removed by PR #478 had been built from the older VPS runner
pattern:

```text
Dashboard WebSocket job
  -> VPS runner
  -> codex exec
  -> final stdout/stderr reply
```

That removed path is insufficient for Issue #450 because it starts a separate Codex
process per turn. A WebSocket transport alone does not make a chat session. The
owner-facing failures observed after PR #477 and deploy confirm this:

- follow-up questions do not behave like the same live Codex conversation
- ordinary conversation is too tied to repository/job dispatch semantics
- response latency feels like a fresh job instead of an active chat
- live Codex events are not surfaced as dashboard state
- final replies are hard to read in the dashboard thread

This is a `butler_gap_found` and `vps_handoff_gap_found`, not a cosmetic UI bug.

## Required boundaries

Dashboard Butler live path:

- MUST use `codex app-server` as the primary Codex execution interface.
- MUST keep one Dashboard thread mapped to a live Codex thread/session.
- MUST send follow-up owner messages as turns on the same Codex thread.
- MUST surface live events from Codex as dashboard chat state.
- MUST support ordinary conversation without requiring repository resolution.
- MUST escalate to repository, Issue, GO, or passkey boundaries only when the
  conversation actually needs those boundaries.
- MUST persist enough Dashboard thread state for iPhone/iPad PWA recovery.
- MUST avoid periodic polling as the primary chat mechanism.

Custom GPT Butler fallback:

- remains the fallback owner surface when the Dashboard live path is unavailable
- continues to use existing Actions, GitHub App reads/writes, runtime truth,
  RAG, and passkey operator links
- is not replaced by the Dashboard path
- is not a reason to keep the Dashboard path on `codex exec`

Shared durable truth:

- GitHub Issues / PRs / Actions
- Worker runtime truth
- operational RAG
- approval grants
- deploy evidence
- dashboard thread records

## Implemented bridge slice

PR for this slice introduces the first separate Dashboard app-server route:

- Worker route: `GET /v2/dashboard/app-server/ws`
- Durable Object role: `app_server_bridge`
- Dashboard -> bridge message: `app_server_turn_requested`
- Bridge -> Dashboard messages:
  - `app_server_status`
  - `app_server_reply_delta`
  - `app_server_reply`
  - `app_server_turn_failed`
- VPS bridge script: `scripts/run-dashboard-app-server-bridge.mjs`

The bridge uses the generated `codex app-server` protocol shape:

- `initialize`
- `thread/start`
- `thread/resume`
- `turn/start`
- notifications including `item/agentMessage/delta` and `turn/completed`

Dashboard turn requests must preserve traffic-control context when present:

- repository and related Issue from the Dashboard thread
- Dashboard authority hints for GO / passkey boundaries
- media reference count plus attachment delivery truth without raw binary material
- for Dashboard media references, the VPS bridge may fetch the short-lived
  media through the runtime bearer boundary and pass a local temporary file path
  to the Codex turn; if fetch fails, the turn context must say so instead of
  letting Butler claim it saw the image
- instructions to read durable Issue / PR / runtime truth before separating
  blockers, next actions, authority boundaries, and evidence gaps
- the mechanical bridge boundary that app-server command, file-change, patch,
  and permission escalation approvals are not granted by the Dashboard bridge

The old Dashboard `codex exec` runner WebSocket remains deleted. If no
Dashboard app-server bridge is connected, Dashboard Butler records the owner
message and reports the bridge as unavailable; it does not pretend to have sent
the turn to VPS Codex CLI.

## Non-goals for this decision

- Do not deploy.
- Do not mutate credentials, permissions, repository settings, or secrets.
- Do not close Issue #450.
- Do not present PR #477 as completing Issue #450.
- Do not keep adding small UI patches to hide the missing live Codex session.

## Implementation planning requirements

Before implementation, the next PR must define:

- the Worker <-> VPS Dashboard Bridge message schema
- the VPS Dashboard Bridge <-> `codex app-server` protocol usage
- Dashboard thread id to Codex thread/session id mapping
- event mapping from Codex app-server events to dashboard messages
- reconnect and restart recovery behavior
- authority boundary handling for repository resolution, Issue creation,
  implementation handoff, merge, deploy, credential mutation, and Issue close
- live E2E evidence required before #450 can close

## Completion reading

Issue #450 remains incomplete until the owner can use Dashboard Butler on
iPhone/iPad as a real continuing chat backed by a live Codex app-server session.

Completion cannot be claimed from:

- WebSocket delivery alone
- one-shot `codex exec` subprocess calls
- stored final replies alone
- PR checks alone
- deploy success alone

Completion requires live Dashboard E2E evidence for:

- ordinary conversation
- follow-up questions in the same thread
- repository / Issue context escalation
- live status while Codex is working
- readable replies
- PWA recovery after app switch / return
- governed high-risk approval boundaries
