# Setup Wizard Approval-Bound Automation Path

## Goal

Define the bounded automation path that allows VTDD to move from a bootstrap
helper toward a wizard-complete setup flow.

This document exists for Issue #210 under parent Issue #182, and extends the
meaning-first reading established by `#203`, `#205`, and `#207`.

It does not claim current VTDD already satisfies wizard-complete automation.
It fixes the target boundary so future runtime work can reduce manual setup
without creating a dangerous secret-ingestion surface.

## Core Reading

For setup wizard to be complete, the human should not have to manually bridge:

- GitHub App creation state
- GitHub App installation state
- Cloudflare runtime secret storage
- service-specific identifiers and secret transport

The wizard is not complete if the human must leave VTDD, copy values across
surfaces, and act as the secure transport layer between provider dashboards.

The target state is:

- VTDD keeps one coherent setup narrative
- external redirects are short, bounded, and return to VTDD context
- privileged writes happen through a narrow approval-bound path
- setup completion is judged by VTDD-ready capability, not by secret presence

## Relationship To Existing Canonical Docs

- `docs/security/setup-wizard-meaning-first-contract.md` defines the user-facing
  bar for calling the surface a wizard at all
- `docs/mvp/setup-wizard-current-and-target-flow.md` defines the current and
  target setup story across GitHub and Cloudflare
- `docs/mvp/setup-wizard-approval-bound-runtime-checkpoint.md` records the
  current runtime checkpoint so future slices do not over-claim what is already
  absorbed
- `docs/security/bootstrap-automation-model.md` defines the auth and bootstrap
  boundary split
- `docs/security/worker-secret-bootstrap-options.md` records the deferred
  approval-bound bootstrap candidate that this issue now turns into a concrete
  target

## Problem Statement

Current setup still depends on manual bridging in places that matter most:

- GitHub can create or install the App, but VTDD may still depend on manual
  capture or repair
- Cloudflare remains the runtime vault, but the human still has to reason about
  secret writes and rotation too directly
- setup success can still collapse into operator diagnostics instead of
  "VTDD can now do real work"

That means current VTDD is still short of the repository's intended setup
wizard reading.

## Target Automation Reading

Wizard-complete automation does not mean "generic admin console."

It means VTDD owns the setup path closely enough that the human can follow one
guided flow while VTDD safely performs the bounded steps needed for readiness.

The target path is:

1. human enters VTDD setup surface
2. VTDD explains the next capability it is about to obtain
3. VTDD sends the human through any unavoidable provider consent/creation step
4. VTDD receives the returned bootstrap material through a bounded callback or
   approval-bound write path
5. VTDD stores or rotates runtime material without making the human carry raw
   values across surfaces
6. VTDD verifies readiness and reports what it can do now

## Required Security Shape

Any wizard-complete automation path must preserve all of the following:

- no secret paste into chat
- no generic secret terminal in setup wizard
- no raw secret echo in HTML, JSON, Issue text, PR text, or logs
- `GO + passkey` remains required for privileged bootstrap authority
- privileged write authority is narrow, short-lived, auditable, and revocable
- Cloudflare remains the system of record for Worker secret storage

This path must not weaken existing safety invariants in order to feel smoother.

## Required Capability Split

The implementation must keep these responsibilities distinct:

### Human Step

The human may still need to approve or confirm bounded provider actions such as:

- creating or installing a GitHub App
- approving an approval-bound bootstrap session
- confirming the repository target or setup scope when ambiguity exists

The human should not have to manually copy IDs, private keys, or secret names
between providers as the normal path.

### VTDD Step

VTDD should absorb the secure transport and orchestration work:

- preserve before/after meaning around redirects
- receive callback outputs needed for setup continuation
- write allowlisted runtime material through a bounded bootstrap authority
- detect installation state where possible
- re-run readiness checks after each successful step

### Provider Step

GitHub and Cloudflare still own their native trust boundaries:

- GitHub owns App creation, installation scope, and permission consent
- Cloudflare owns Worker runtime secret storage and execution hosting

VTDD orchestrates those systems. It does not replace their trust models.

## Proposed Bounded Automation Path

The initial wizard-complete automation candidate should be a brokered one-time
bootstrap session behind approval boundary.

That candidate should be read as:

- setup-specific rather than general-purpose
- allowlisted rather than arbitrary
- short-lived rather than persistent admin access
- audited rather than silent

The path should be capable of handling the setup-critical runtime material
without exposing a generic write-any-secret surface.

## Current In-Scope Automation Targets

The next runtime slices under this document may automate:

- GitHub App manifest callback capture
- GitHub App installation detection and binding
- approval-bound write of allowlisted setup-critical runtime material
- user-facing readiness verification after a successful write

## Out Of Scope

The following remain out of scope even under wizard-complete automation:

- generic secret management UI for arbitrary runtime secrets
- silent permanent operator authority hidden behind setup wizard
- broad end-user Cloudflare credential issuance
- replacing provider consent screens with fake VTDD-only state
- claiming overall setup completion before live readiness is verified

## Acceptance Criteria For Future Runtime Work

Future runtime slices under `#210` should be judged against all of these:

1. The intended setup path does not require manual copy/paste of setup-critical
   IDs or secrets across GitHub and Cloudflare surfaces.
2. Any privileged write path is explicitly approval-bound and limited to a
   narrow allowlist.
3. The wizard can explain when the automation path is available, blocked, or
   intentionally deferred.
4. After a successful step, the wizard reports VTDD capability in user-facing
   terms rather than only low-level diagnostics.
5. The implementation preserves the distinction between provider consent,
   operator bootstrap authority, and runtime machine auth.

## Current Status Reading

Current VTDD does not yet satisfy this target.

Today the repository has:

- a meaning-first bar for evaluating setup wizard
- a canonical current/target flow across GitHub and Cloudflare
- a partial GitHub App handoff runtime slice
- a deferred approval-bound bootstrap candidate

What remains is to turn that deferred candidate into a concrete runtime path
without creating unsafe secret-ingestion behavior.
