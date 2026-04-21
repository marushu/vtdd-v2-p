# Day0 Setup Wizard Shared-Use Spec

## Purpose

Define the canonical Day0 setup wizard contract for a VTDD flow that is usable
by people other than the owner.

This document exists to stop drift from the historical setup flow, which only
bootstraps secrets into an already-existing Worker runtime.

## One-Sentence Reading

Day0 setup wizard must let each invited user complete VTDD setup on their own
GitHub, Cloudflare, Gemini, and ChatGPT accounts, including creation or
resolution of a user-owned Cloudflare runtime, without relying on the owner's
personal runtime URL, then reveal VTDD entry surfaces such as the shared GPT
link and Codex handoff only after setup is ready.

## Problem Statement

Historical setup work established a bounded bootstrap path for:

- GitHub App runtime secret intake
- required settings intake
- readiness reporting against an existing Worker runtime

That is not sufficient for shared/public use.

If VTDD is meant to be usable by invited users other than the owner, the wizard
must no longer assume:

- an already-existing owner-controlled Worker runtime
- an owner-specific `workers.dev` URL
- an operator-only Cloudflare destination hidden behind the public setup flow

## Required Outcome

When Day0 setup wizard reaches `ready`, all of the following must be true:

1. the user has accepted the beta and billing-responsibility terms
2. the user has completed GitHub-side setup on their own account
3. the user has completed Cloudflare-side setup on their own account
4. a user-owned Cloudflare runtime has been created or resolved in-flow
5. the runtime URL is now known to VTDD without owner-only assumptions
6. VTDD-required runtime secrets/settings are present on that user-owned runtime
7. Gemini API key setup is complete
8. ChatGPT / VTDD GPT entry can be shown only after the prior steps are ready
9. Codex handoff may be shown only after the same Day0-ready state is reached

If any one of these is false, wizard status remains `partial`, `blocked`, or
`in_progress`, but not `ready`.

## Non-Goals

The first Day0 shared-use implementation does not need to include:

- automatic Gemini API key issuance
- automatic GPT creation
- payments or billing collection
- automatic upgrade propagation to user-owned repos
- automatic teardown of user-created runtimes

## Shared-Use Invariants

The Day0 wizard must preserve these invariants:

- public setup flow must not embed the owner's personal runtime URL
- setup must converge on user-owned service accounts
- the wizard must fail closed when ownership or target resolution is ambiguous
- owner-specific bootstrap assumptions must be treated as migration debt
- completion claims must refer to user-observable behavior, not operator intent
- raw user-owned runtime URLs must not be rendered in the wizard UI merely
  because they have been created or resolved

## Cloudflare Connection Contract (Fixed For First Implementation)

The first shared-use Day0 implementation fixes the Cloudflare connection path
as an API Token flow, not an OAuth flow.

This is a canonical choice for the first implementation slice and must not be
quietly swapped in code or UX without updating this spec.

The wizard must treat OAuth as deferred, not implied.

The minimum Cloudflare API capability for this first flow is:

- a token that can perform `Workers Scripts Write`

Reference baseline:

- Cloudflare API marks `Workers Scripts Write` as an accepted permission for
  enabling a Worker on the `workers.dev` subdomain
- Cloudflare provides token templates for "Workers scripts only"

## Step Model

### Step 0: Welcome And Consent

The wizard must:

- explain invitation-only beta status
- explain that service costs remain user-owned
- explain that new Worker/runtime resources may be created
- require consent before allowing progress

### Step 1: GitHub

The wizard must:

- confirm the invited user is acting on their own GitHub account
- create or reuse a user-owned fork as the wizard-controlled repository
  destination for VTDD
- complete GitHub-side app/install or equivalent repository authority setup

For the current wizard path, fork is the canonical repository creation path.

Manual fork / clone remains allowed outside the wizard, but it is not the
wizard-controlled happy path for Day0 completion.

### Step 2: Cloudflare

The wizard must:

- confirm the user is acting on their own Cloudflare account
- collect a user-scoped Cloudflare API Token with the minimum permissions
  required for this flow
- create or resolve a user-owned Worker/runtime inside the flow
- keep the resulting runtime URL in wizard state without rendering the raw URL
  in the normal setup UI
- prepare that runtime for narrow secret/bootstrap writes

This is a required behavior, not optional polish.

The Cloudflare step should run in this order:

1. validate the API token against the intended user account
2. identify or create the account Workers subdomain if needed
3. determine whether a reusable VTDD worker already exists for this setup
4. create the user-owned Worker if no acceptable runtime exists
5. enable the Worker on the `workers.dev` subdomain if needed
6. persist the runtime identity in setup state without rendering the raw URL in
   public-facing setup output
7. continue with required runtime secret/bootstrap writes against that
   user-owned runtime

The wizard may expose human-readable progress such as:

- Cloudflare account connected
- runtime prepared
- runtime secrets pending
- runtime ready

The wizard must not expose the raw runtime URL by default in:

- public HTML
- ordinary wizard JSON
- public docs
- logs intended for shared troubleshooting

### Cloudflare Token Handling Contract

The Cloudflare API Token is setup-sensitive material.

For the first implementation, the wizard must treat the token as:

- accepted through a bounded setup step
- retained only in server-controlled temporary setup state
- excluded from URLs, query parameters, normal JSON output, rendered HTML, and
  shared troubleshooting logs
- discarded once runtime create-or-resolve and the required runtime writes for
  the current setup flow are complete, or when the temporary setup state
  expires

The wizard must not:

- echo the raw token back to the browser after submission
- place the raw token in redirect targets
- persist the raw token in Git-managed docs or memory records

### Cloudflare Wizard State Model

The wizard must model Cloudflare progress with explicit state, not inferred copy.

At minimum, Cloudflare setup state must distinguish:

- `not_started`
- `token_pending`
- `token_verifying`
- `account_verified`
- `subdomain_resolving`
- `runtime_resolving`
- `runtime_creating`
- `runtime_prepared`
- `secret_bootstrap_pending`
- `ready`
- `blocked`

The wizard must retain internal state for:

- Cloudflare account identifier
- whether the Workers subdomain already existed
- whether the runtime was reused or newly created
- the selected Worker script name
- the resolved runtime URL

The resolved runtime URL is internal state only by default. It is not a normal
wizard display field.

### Cloudflare Create-Or-Resolve Rules

The create-or-resolve logic must be deterministic.

For the first implementation:

1. if a reusable VTDD-designated Worker already exists for the verified user
   account and unambiguously matches the current setup target, wizard may reuse
   it
2. otherwise wizard must create a new Worker
3. if multiple candidate Workers exist and no single candidate is clearly
   correct, wizard must fail closed instead of guessing

The create-or-resolve decision must be recorded in setup state as one of:

- `reused_existing_runtime`
- `created_new_runtime`
- `blocked_runtime_ambiguity`

### Cloudflare Naming Rule

The first implementation must use a deterministic VTDD-specific Worker naming
rule rather than free-form names.

The exact string format may be implementation-defined, but it must satisfy:

- derived from VTDD context rather than the owner's personal naming
- stable enough for re-resolution on retry
- safe to compare for reuse
- not dependent on a hardcoded owner account or owner runtime URL

### Cloudflare Failure Contract

The Cloudflare step must fail closed when any of these are true:

- the API token cannot be validated
- the token does not belong to the acting user account
- required Worker permissions are missing
- the Workers subdomain cannot be created or resolved
- the Worker cannot be created or selected safely
- runtime identity is still ambiguous after create-or-resolve logic

If the Cloudflare step fails closed, wizard must remain blocked and must not
reveal VTDD entry surfaces.

### Step 3: Gemini

The wizard may treat Gemini as a guided-manual step.

The wizard must:

- explain where to obtain a Gemini API key
- accept the key through a bounded step
- store it on the user-owned runtime

### Step 4: ChatGPT / VTDD GPT Entry

The wizard must:

- explain that ChatGPT login is still required for use
- withhold VTDD GPT entry until prior setup is complete
- show the shared VTDD GPT link only after wizard state is ready

### Step 5: Codex Handoff

The wizard may treat Codex as an additional post-setup surface.

The wizard must:

- avoid presenting Codex as a bypass for incomplete setup
- explain that Codex continues against the same user-owned repository and
  user-owned Cloudflare runtime
- reveal Codex handoff only after the same readiness gate used for shared VTDD
  GPT entry

## Decision Log

- Shared-use Day0 setup uses a server-controlled temporary secret store in D1.
- GitHub App manifest bundle and Cloudflare API token stay in D1 only until
  Day0 core readiness is proven.
- Browser-visible setup state carries opaque session/cookie references only and
  never raw secret values.
- Raw user-owned Worker URLs must stay off public wizard surfaces, normal JSON,
  shared logs, and published docs.
- Day0 completion is split into:
  - core ready: user-owned GitHub, Cloudflare runtime, and Gemini are ready, so
    Codex handoff may continue
  - shared GPT reveal: follow-on ChatGPT entry that is shown only when a shared
    VTDD GPT URL is configured
- Temporary D1 entries must be purged as soon as Day0 core reaches `ready`.

## Current Gaps Against This Spec

The current repository is still missing these shared-use behaviors:

1. Cloudflare runtime creation inside wizard
2. runtime URL resolution as part of wizard state
3. GitHub-side user-owned repository destination flow
4. explicit shared-use completion gate covering all required services
5. removal of owner-only runtime assumptions from setup logic

## First Implementation Slice

The first implementation slice for this spec should:

1. remove owner-specific runtime assumptions from public setup surfaces
2. introduce explicit Day0 step/state modeling for:
   - consent
   - GitHub
   - Cloudflare
   - Gemini
   - ChatGPT
   - Codex handoff after ready
3. represent Cloudflare runtime creation/resolution as required incomplete work
4. stop presenting the old bootstrap flow as wizard-complete

This first slice may still be `blocked` on provider integration, but it must
make the missing behavior visible in VTDD terms rather than hiding it behind an
owner-only runtime.
