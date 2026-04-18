# Bootstrap Automation and Service Connection Model

## Goal

Define the main-line bootstrap architecture for VTDD V2.

This document exists for Issue #182 and the child Issue that fixes the current
GitHub manifest bootstrap boundary.

It treats setup wizard as a core VTDD entry surface, not as optional onboarding
chrome.

## Why This Is Main-line Work

VTDD V2 is trying to remove unnecessary complexity from development.
That makes bootstrap part of the product, not a side task.

If the system only works after the operator knows how to:

- find the right dashboard pages
- create and copy tokens
- understand repository/app/runtime terminology
- manually wire secrets before the first useful run

then VTDD has not yet removed the complexity that matters most.

The current `github_app_manifest_conversion_failed` `403` is not only an
implementation bug.
It is evidence that the GitHub connection model is still under-specified.

## Core Reading

### Setup Wizard Is Core

Setup wizard is a core VTDD surface because it decides whether a human can reach
VTDD's judgment/runtime without first learning operator-only complexity.

This means setup wizard work must be treated like core runtime work when:

- defining boundaries
- ranking priorities
- deciding what blocks live/manual testing

### Service Auth Is Not the Same as External Account Connection

VTDD must distinguish at least these layers:

1. VTDD service access
2. operator bootstrap authority
3. external account connection
4. runtime machine auth

They must not be collapsed into one vague "login" idea.

## Required Boundary Split

### 1. VTDD Service Access

This is the boundary for entering VTDD itself.

Examples:

- setup wizard passcode
- future Access OTP or equivalent low-friction gate
- future VTDD account/session

Purpose:

- keep the setup surface from being a public brochure page
- let the user reach VTDD without learning internal API details

This layer is about entering VTDD, not about granting GitHub or Cloudflare
rights yet.

### 2. Operator Bootstrap Authority

This is the narrow authority needed to bootstrap or rotate runtime capabilities
that VTDD itself depends on.

Examples:

- Cloudflare bootstrap token already held by the service operator
- future service-owned GitHub auth used only for a bounded conversion step

Rules:

- operator bootstrap authority must be narrow and purpose-limited
- it must not become a generic admin console
- it must not silently expand into broad end-user execution authority

### 3. External Account Connection

This is the layer where VTDD gains the right to act against external systems for
one user or one installation.

Current main-line systems:

- GitHub
- Cloudflare

Current reading:

- GitHub connection and Cloudflare connection are separate problems
- neither should be described as solved just because the user can open setup wizard
- connection state must be observable from setup/status surfaces

### 4. Runtime Machine Auth

This is the machine-facing boundary for internal execution surfaces.

Current accepted modes remain:

- bearer token
- Cloudflare Access service token

This layer protects `/v2/gateway` and `/v2/retrieve/*`.
It must stay fail-closed and distinct from browser-facing setup auth.

## GitHub Connection Reading

### What the Current Manifest Flow Achieves

The current setup wizard manifest slice can:

- start GitHub's manifest registration UI from setup wizard
- return to VTDD with a manifest callback code
- prepare the path for automatic runtime bootstrap

### What the Current Manifest Flow Does Not Yet Solve

The callback currently fails with `403` during manifest conversion.

Current reading:

- the missing piece is not "better form HTML"
- the missing piece is the auth source for manifest conversion

This means the next runtime slice must answer:

- whose GitHub auth is used for conversion
- whether it is service-owned, user-owned, or session-bound
- how that authority is narrowed and audited

Do not continue treating this as a cosmetic setup-wizard bug.

### Current Bounded Reading For The Next Slice

For the current bounded runtime slice, manifest conversion is treated as using a
service-owned GitHub token stored on Worker runtime.

That token is:

- operator-managed
- purpose-limited to manifest conversion/bootstrap work
- never collected through setup wizard itself
- expected to be a GitHub token class supported by the manifest conversion endpoint

Current implementation reading:

- Worker first tries `Authorization: Bearer ...`
- if GitHub returns `401/403`, Worker retries with `Authorization: token ...`
- if conversion still fails with `403`, treat that as a token contract mismatch or owner-permission mismatch, not as a setup wizard cosmetic fault
- on conversion failure, setup wizard should expose bounded diagnostics for the operator-managed token:
  - actor login
  - actor type
  - OAuth scopes headers when available
  - whether actor resolution succeeded at all

Known unsupported classes from GitHub docs for this endpoint include:

- GitHub App user access tokens
- GitHub App installation access tokens
- fine-grained personal access tokens

This is a bounded bridge, not the final end-user GitHub connection model.

## Cloudflare Connection Reading

Current Cloudflare bootstrap is still operator-seeded.

Current reading:

- `CLOUDFLARE_API_TOKEN` bootstrap is still an operator bootstrap concern
- this is not yet a user-facing Cloudflare connect flow
- setup wizard may depend on operator-seeded bootstrap credentials today
- that dependency must be stated plainly rather than hidden behind implied automation
- when setup wizard secret writes fail, VTDD should return bounded Cloudflare diagnostics for:
  - token verify failure
  - account or script target mismatch
  - missing `Workers Scripts Write` permission

## Main-line Phasing

### Phase A: Core Entry and Service Boundary

Define:

- how a human enters VTDD
- what setup wizard is allowed to expose
- what remains operator-only

### Phase B: GitHub Connection Model

Define:

- manifest conversion auth source
- installation capture path
- observable GitHub connection state in setup/status surfaces

### Phase C: Cloudflare Connection Model

Define:

- which Cloudflare bootstrap steps remain operator-seeded
- which steps can move into bounded wizard flow later
- how public worker/runtime information is surfaced without leaking secrets

### Phase D: Inventory and Diagnosis

Expose current-state visibility so VTDD can answer questions like:

- what runtime is live now
- what GitHub/Cloudflare state is configured
- what remains missing before safe execution

## Immediate Next Slice

The next bounded runtime slice should target the GitHub manifest conversion auth
boundary, not broader automation claims.

That slice should:

- trace to the child Issue under `#182`
- define the auth source used by manifest conversion
- keep install automation and Cloudflare automation out of scope

## Non-goals

- claiming that bootstrap is already low-friction end to end
- claiming that setup wizard has replaced all dashboard/bootstrap work
- treating GitHub and Cloudflare connection as the same auth problem
- using setup wizard as a generic secret terminal
