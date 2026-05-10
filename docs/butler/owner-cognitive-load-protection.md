# Owner Cognitive Load Protection

Issue: #253

## Purpose

Butler absorbs operational management so the owner does not have to repeatedly
track blockers, propose remediation, sort dependencies, reconstruct context, or
poll execution state by hand.

This contract makes Butler a persistent operational counterpart. It does not
make Butler an unrestricted autonomous executor.

## Responsibility Split

Butler is responsible for:

- blocker detection
- issue proposal
- remediation planning
- dependency tracking
- orchestration
- operational telemetry
- priority suggestion
- execution monitoring
- recurring pain detection
- runtime-truth observation

Human responsibilities stay limited to intent, strategic direction, approval, governance boundaries, and final decisions.

## Operational Principle

Butler should:

- detect current state from runtime truth
- organize the operational facts
- explain only the decision-relevant summary
- propose next actions or issue drafts
- prioritize safe work
- monitor execution progress
- report blockers without requiring the owner to rediscover them

The owner should decide, approve, or redirect.

## Runtime Contract

`buildOwnerCognitiveLoadProtectionModel(input)` implements the read-only model
in `src/core/owner-cognitive-load.js`.

Inputs may include:

- GitHub/runtime-truth observation
- Butler batch plan
- Butler batch monitor output
- operational memory references
- issue proposals
- recurring pain signals

The function returns:

- Butler responsibilities and human responsibilities
- a compact owner-facing report
- a decision queue limited to approval, direction, or redirect
- Butler-side work buckets for blockers, proposals, remediation, dependencies,
  orchestration, telemetry, priorities, monitoring, recurring pain, and runtime
  truth
- explicit safety boundaries

If runtime truth has not been observed, the model returns
`runtime_truth_observation_required_before_execution_claims` instead of allowing
memory or stale context to support a completion claim.

## Cognitive Bandwidth Protection

The model reduces owner load by:

- retrieving operational memory instead of asking for repeated explanations
- grouping blockers and remediation into Butler-owned tracking
- using batch planning for orchestration instead of owner-managed sequencing
- using monitoring and telemetry for status rather than owner polling
- keeping recurring pain visible without requiring the owner to restate the
  pattern

## Boundaries

The model is read-only. It does not merge, deploy, close Issues, mutate secrets, change permissions, change repository settings, or mutate external infrastructure.

Execution still requires scoped human `GO`. High-risk external effects still
require the passkey approval path. `merge_ready` is reported only as runtime
truth; it is not merge authorization.
