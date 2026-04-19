# Setup Wizard Current And Target Flow

## Goal

Explain, in one canonical place, what setup wizard is doing today, why GitHub
App and Cloudflare are involved, and what must change before VTDD can honestly
say the wizard is complete.

This document exists for Issue #205 under the meaning-first contract in `#203`
and the bootstrap parent `#182`.

## One-Sentence Reading

Today, setup wizard is helping VTDD acquire a GitHub execution identity and
store that identity on Cloudflare Worker runtime so Butler can mint short-lived
GitHub installation tokens later.

That is why both GitHub and Cloudflare appear in setup.

## System Roles

### Setup Wizard

Setup wizard is the VTDD entry surface.

Its job is to:

- explain what VTDD needs before it can operate
- guide the human through bounded bootstrap steps
- show what is already connected and what is still blocked
- hand off operational configuration for Butler surfaces such as Custom GPT

### GitHub App

GitHub App is VTDD's GitHub-side execution identity.

It exists so VTDD can:

- read the live repository index
- act against issues, pull requests, and contents within the installation
- mint short-lived installation tokens instead of relying on broad static user
  credentials

### Cloudflare Worker Runtime

Cloudflare Worker runtime is where VTDD stores the GitHub App bootstrap
material and later uses it for live GitHub execution.

In current VTDD, Worker runtime needs to hold:

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_APP_INSTALLATION_ID`

Cloudflare is therefore not "the thing being set up instead of GitHub."
It is the runtime vault and execution host that lets VTDD actually use the
GitHub App after bootstrap.

## Why GitHub And Cloudflare Both Appear

The setup flow crosses services because the responsibilities are different.

GitHub provides:

- the app identity
- the installation relationship to repositories
- the permissions VTDD will use later

Cloudflare provides:

- the Worker runtime where VTDD runs
- the secret store where GitHub App material is kept
- the execution environment that later signs JWTs and mints installation tokens

So the current wizard is effectively doing this:

1. obtain or update GitHub execution identity
2. store that identity on Worker runtime
3. verify that VTDD can now use it safely

## Current Flow

### Phase 1: Enter VTDD

The human opens `/setup/wizard` and passes the setup access boundary.

Meaning:

- the human is entering VTDD's bootstrap surface
- this is not yet granting GitHub or Cloudflare authority
- it is only allowing access to the setup surface itself

### Phase 2: Read The Onboarding Pack

The wizard exposes:

- Butler construction text
- Action schema import URL
- machine-auth guidance
- deploy boundary guidance
- repository resolution / approval / reviewer contracts

Meaning:

- VTDD is teaching the Butler surface how to talk to Worker runtime safely
- this is the operational contract layer, not the external-account connection
  layer

### Phase 3: Start GitHub App Bootstrap

The wizard opens GitHub's manifest flow.

Meaning:

- VTDD is trying to acquire a GitHub App identity
- this identity is the approved GitHub credential model for VTDD
- the wizard is not asking for a broad permanent personal token to run VTDD

### Phase 4: Install The GitHub App

The GitHub App is installed to the relevant account/repositories.

Meaning:

- VTDD now has a relationship to a specific installation scope
- the installation is what later allows VTDD to mint short-lived installation
  tokens

### Phase 5: Store Runtime Secrets On Cloudflare

The wizard or operator writes the GitHub App trio to Worker runtime:

- App ID
- private key
- installation ID

Meaning:

- VTDD is moving from "GitHub identity exists" to "Worker runtime can actually
  use that identity"
- without this step, Butler still cannot mint installation tokens during live
  operation

### Phase 6: Probe Live Readiness

The wizard runs `githubAppCheck=on` and, when possible, tries live repository
index access.

Meaning:

- VTDD is testing whether bootstrap material is not only present, but usable
- the desired success state is not merely "some secrets exist"
- the desired success state is "VTDD can now do real GitHub work safely"

## Current Manual Debt

Current setup is still not wizard-complete because the human must bridge several
cross-service handoffs manually.

Current debt includes:

- understanding why GitHub App creation is needed
- leaving VTDD for GitHub without enough before/after narration
- discovering or carrying installation information manually
- rotating or entering Cloudflare bootstrap secrets outside the wizard flow
- interpreting operator diagnostics when setup fails

This is why current VTDD setup is still better described as a bounded bootstrap
helper.

## Target Flow

The completed wizard should still be safe, but the human experience should be
coherent.

### Target Phase A: Explain The Goal Before The Step

Before any external redirect, wizard should explain:

- what VTDD is about to obtain
- why this is needed
- what VTDD will be able to do after it succeeds

### Target Phase B: Keep Cross-Service Continuity

When the wizard sends the human to GitHub or Cloudflare, it should preserve a
single narrative:

- "we are connecting GitHub"
- "we are storing VTDD's runtime identity"
- "we are verifying live readiness"

The human should not need to infer that narrative alone from provider UIs.

### Target Phase C: Reduce Manual Carry

The human should carry as little service-specific data as possible.

Where manual transfer still exists, the wizard should:

- say exactly what value is needed
- say why that value matters
- say what changes after it is stored

### Target Phase D: Return User-Facing Status

After each major step, the wizard should answer in VTDD terms:

- GitHub connection ready / blocked
- Worker runtime ready / blocked
- Butler can now list repositories / cannot yet mint installation tokens

Operator diagnostics can still exist below that layer.

## Remaining Gaps To Close

### Gap 1: GitHub Redirect And Return Meaning

The wizard still needs to narrate the GitHub handoff before and after redirect
in VTDD terms.

Tracked by:

- Issue #206

### Gap 2: Installation Capture As A Wizard Step

Installation capture is still partly exposed as manual operator work.

Tracked by:

- Issue #206

### Gap 3: Cloudflare Bootstrap As A Meaningful Prerequisite

Cloudflare prerequisites still appear mostly as operator diagnostics and secret
management work.

Tracked by:

- Issue #207

### Gap 4: Success State In User Terms

Setup state still leans too heavily on low-level diagnostics rather than
"VTDD can now do X" messaging.

Tracked by:

- Issue #206
- Issue #207

### Gap 5: Approval-Bound Automation Path For Wizard Completion

Current setup still depends on manual bridging in places that a completed
wizard should absorb.

Tracked by:

- Issue #210

## Definition Of Done For Wizard Completion

VTDD can claim the setup wizard is complete only when:

1. a human can follow the intended path without reconstructing the underlying
   architecture
2. GitHub and Cloudflare steps are narrated as one coherent VTDD setup story
3. cross-service data carry is minimized and clearly explained when still needed
4. success and blocked states are legible in user-facing VTDD terms
5. the resulting runtime can actually perform the intended Butler/GitHub live
   operations
6. the bounded setup path does not depend on the human manually transporting
   setup-critical IDs or secrets between providers
