# Proactive Operational Proposal Engine

This document is the Issue #252 architecture contract for Butler proactive
operations. It defines a proposal-only engine that turns operational signals
and historical memory into bounded Issue drafts and remediation plans.

## Intent

Butler should reduce owner cognitive load by proactively moving from:

`detect -> explain -> propose -> prioritize -> ask for GO`

The engine does not execute remediation. It prepares the proposal surface that
Butler can show to the owner before any write or implementation handoff.

## Detection Targets

The engine classifies signals into the Issue #252 target families:

- `operational_gap`: missing runtime truth, orchestration instability,
  notification visibility gaps, proposal failures, or telemetry gaps
- `recurring_pain`: repeated blockers, recurring CI failures, repeated manual
  intervention, or other repeat operational friction
- `governance_problem`: hidden execution, unclear authority boundary, missing
  approval flow, or GO/passkey ambiguity
- `capability_gap`: owner-equivalent capability missing, GitHub UI fallback
  requirements, or unsupported operational capability

## Proposal Output

`buildProactiveOperationalProposals(input)` returns:

- detected proposal opportunities
- explanation and root-cause hypothesis
- Issue draft title/body/labels
- remediation plan
- execution plan
- priority score and factor breakdown
- dependency ordering
- bounded implementation slices
- explicit GO prompt

The returned execution plan is always `proposal_only` and marks execution as
approval-bound.

## Priority Model

Priority scoring combines the Issue #252 factors:

- blocker severity
- operational impact
- dependency chains
- owner cognitive load
- recurrence frequency
- governance importance

Scores are converted into `high`, `medium`, or `low` recommendations. The
factor breakdown is returned so Butler can explain why a proposal was ranked.

## Memory Context

Operational memory is used as background proposal context only. Related memory
references can improve the remediation plan and Issue draft by surfacing prior
repair cases, decisions, and proposal logs.

Runtime truth remains separate and must override historical memory for current
state. The engine does not store full conversation transcripts and does not
mutate memory by itself.

## Governance Boundary

Butler may:

- detect
- explain
- propose
- prioritize

Butler must not:

- silently execute high-risk actions
- bypass approval boundaries
- create Issues without human GO
- start implementation handoff without human GO
- mutate secrets, permissions, repository settings, deploys, or external
  infrastructure from proposal context

If a remediation would touch high-risk external effects, the proposal must keep
that work blocked until the applicable `GO + passkey` path is satisfied.

## Runtime Entry Point

The runtime contract lives in
`src/core/proactive-operational-proposals.js`.

It is pure and side-effect-free so Butler can use it before deciding whether to
ask the owner for GO.
