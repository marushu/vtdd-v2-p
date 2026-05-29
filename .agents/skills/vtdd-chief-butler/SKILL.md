---
name: vtdd-chief-butler
description: Use for VTDD, Dashboard Butler, marushu/vtdd-v2-p, Butler handoff, traffic control, RAG, preflight, Issue/PR/deploy work, notification regressions, passkey/approval boundaries, voice/text Butler UX, and owner drift reports. Enforces issue traceability, repository sharing, authority boundaries, and Butler-first completion before coding.
---

# VTDD Chief Butler

This Skill is a repository-backed traffic-control contract. It must not exist
only in a local mac Codex install.

Use it before acting on VTDD / Dashboard Butler work. The purpose is to prevent
drift: do not treat a fresh complaint as an isolated fix if Issue, PR, deploy,
runtime truth, RAG history, or execution queue state can explain it.

## Product Premise

VTDD's normal operating center is:

`Owner on iPhone/iPad -> Dashboard Butler -> VTDD runtime -> VPS Codex CLI`

mac Codex is a bootstrap, debug, or emergency support surface while Dashboard
Butler and VPS Codex CLI are incomplete. It is not the canonical owner-facing
operator.

If a capability needed for VTDD exists only on mac Codex, treat that as a
defect, not as an acceptable operating mode. Either promote it to repository /
runtime / VPS-readable truth or remove the dependency.

Use these labels for discovery and repair tracking only:

- `mac_codex_only_probe`: useful local investigation only
- `butler_gap_found`: Dashboard Butler cannot use or observe it
- `vps_handoff_gap_found`: VPS Codex CLI cannot reproduce or execute it
- `recovery_gap_found`: iPhone/iPad recovery is still missing

## Required Startup

Before non-trivial work, read or explicitly mark missing:

- `AGENTS.md`
- `docs/butler/intent-mode-contract.md`
- `docs/butler/thread-independent-startup-contract.md` when startup, handoff,
  RAG recall, or cross-surface consistency matters
- `docs/butler/execution-queue-contract.md`
- `docs/mvp/active-issue-execution-queue.md`
- exact Issue / PR / branch / review / check truth for the current request

Report whether thread-local assumptions have been promoted into durable repo or
RAG state: `threadLocalAssumptionsPromoted=true`, `false`, or `未確認`.

## Traffic-Control Snapshot

For non-trivial work, produce a short Japanese-first snapshot before coding:

- `対象`: current owner request in one sentence
- `Issue/PR`: scoped Issue and related PR/deploy/run if known
- `現状`: runtime truth, not guesswork
- `境界`: GO/passkey/approval/forbidden boundary
- `次`: the next concrete action

## Bounded Change Contract

Before runtime code edits, state:

- target Issue number(s)
- exact Success Criteria being implemented
- explicit Non-goals
- files expected to change
- planned validation
- whether archived wizard artifacts or owner-specific runtime values are touched
- whether the change is safe for public/core reuse

If no Issue maps to the change, do not code. Create or propose a bounded Issue
candidate first.

## Repository Sharing Gate

Do not say a Skill, guardrail, operating rule, or traffic-control behavior is
shared, repo-backed, durable, or complete unless:

- the rule is in repository files, not only `~/.codex/skills`, plugin cache, or
  chat memory
- the changed files are committed on a topic branch
- the branch is pushed
- a Japanese-first PR maps the Issue criteria, evidence, and unconnected parts
- Dashboard Butler / VPS Codex CLI readability is stated honestly

If Dashboard Butler runtime discovery, Custom GPT Action Schema, VPS inventory,
or E2E is missing, mark the work `unconnected` or `incomplete`.

## Authority Boundary

- Ordinary read/status/proposal work may proceed without high-risk authority.
- Implementation requires Issue-backed scope and the appropriate GO boundary.
- Merge, post-merge Issue closure, and merged-branch deletion require explicit
  scoped `GO`.
- Deploy, credential mutation, permission mutation, destructive work, or
  privileged host maintenance require scoped passkey approval.
- Never ask the owner to paste raw secrets or sudo passwords into Butler chat.

## Operator URL Rule

When the owner asks to show or open a deploy/operator screen, do not only open a
local browser or describe the route. Return a short clickable Markdown link
whose href is the complete same-origin absolute URL.

Prefer runtime truth fields such as `selfParity.deployOperatorMarkdownLink`,
`selfParity.deployOperatorUrl`, or `selfParity.deployRecovery.operatorUrl`.
Never hard-code an owner-specific production URL into public repository files.

## RAG Candidate Rule

Propose a compact RAG candidate when a durable judgment or failure mode is
discovered, especially:

- a regression timeline or root cause
- owner frustration that identifies repeated assistant drift
- a mac Codex-only capability gap
- an authority boundary clarification
- a handoff/preflight/startup rule needed in future threads

Do not persist full transcripts by default. Exclude secrets and raw sensitive
material.

## Completion Boundary

Using this Skill is not completion evidence. Butler-facing completion still
requires natural-language reachability, schema/tool exposure, runtime route or
runner connection, authority boundary, runtime truth, E2E evidence, and PR
mapping.
