# Setup Wizard Approval-Bound Runtime Checkpoint

## Purpose

Record the current runtime checkpoint for Issue `#210` so future work can
separate:

- what is already implemented on the live wizard surface
- what is only described or narrated today
- what still needs actual automation behavior before wizard-complete can be
  claimed

This document is a drift-control checkpoint, not a completion claim.

## Related Canonical Inputs

- `docs/security/setup-wizard-approval-bound-automation-path.md`
- `docs/mvp/setup-wizard-current-and-target-flow.md`
- `docs/security/bootstrap-automation-model.md`

## Current Runtime Surface That Exists

The worker runtime already exposes an approval-bound bootstrap session surface
that can explain and partially execute bounded setup work.

Current runtime evidence includes:

- approval-bound request recording behind `GO + passkey`
- signed one-time session envelope generation
- bounded consume endpoint for that envelope
- actual narrow installation-binding write when the only remaining write is
  `GITHUB_APP_INSTALLATION_ID`
- verification-only consume completion when no runtime write remains and proof
  is the only remaining step
- immediate post-consume readiness proof
- absorbed success state after bounded consume succeeds

## Current Meaning Surfaces Already Landed

The wizard can now report the following as user-facing runtime surfaces:

- provider connection phase
- service connection model
- service connection actionability
- service connection friction
- service connection handoff shape
- service return continuity

These surfaces make the current intended reading explicit:

- the human may still perform provider auth or consent
- the human should not be the secure transport layer between providers
- provider redirects should return into the same setup narrative
- success should be described as VTDD capability, not raw secret presence

## Current Actual Automation Boundary

Current runtime is not yet a general wizard-complete automation path.

What is actually automated today is narrower:

1. GitHub App bootstrap can move through manifest callback capture.
2. Single installation detection/binding can be absorbed into runtime.
3. One bounded approval-bound write path can complete installation binding.
4. The same approval-bound envelope can complete verification-only consume when
   no write remains and the remaining step is proof.
5. Live readiness proof can run immediately after bounded consume.

This means current runtime has one real absorbed path, but not a general
"connect every required service end-to-end" path yet.

## Current Deferred Or Incomplete Areas

The following are still incomplete relative to `#210`:

- broad provider-login/connect automation is not implemented
- Cloudflare operator bootstrap recovery still exists as debt
- the approval-bound path is still narrow and setup-specific rather than a
  complete absorbed setup authority
- reviewer-provider setup such as Gemini key acquisition is not part of the
  current wizard path

## Interpretation Boundary

The current runtime should be read as:

- more than a purely descriptive contract
- less than a wizard-complete setup flow

In other words, VTDD can now prove one bounded approval-bound setup path, but
must not yet claim that all required service connections are absorbed.

## Next Runtime Boundary

The next runtime slice after this checkpoint should prefer actual behavior over
more narration.

The intended target is a bounded automation step that reduces remaining manual
provider or operator bridging rather than adding more explanatory readouts.
