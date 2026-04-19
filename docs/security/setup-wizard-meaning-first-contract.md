# Setup Wizard Meaning-First Contract

## Goal

Define what VTDD must satisfy before `/setup/wizard` can honestly be described
as a setup wizard.

This document exists for Issue #203 under parent Issue #182, with hardening and
entry-boundary linkage to Issue #175.

It treats the current user complaint as a product signal, not as incidental UX
feedback:

- even when the human follows the steps,
- the human can still lose track of what is happening,
- which means VTDD is still exposing operator-only complexity instead of
  absorbing it.

## Core Reading

VTDD is not trying to produce a prettier checklist for experts.
VTDD is trying to remove unnecessary complexity from the human path.

That means setup wizard is only a wizard if the human can continue by following
meaningful steps without having to reconstruct the system model from GitHub,
Cloudflare, secret storage, installation URLs, and token semantics.

If the human is effectively acting as the integration layer between multiple
dashboards, the surface is not yet a wizard.

## What A Setup Wizard Must Do

### 1. Preserve Meaning At Every Step

At every step, the human must be able to answer:

- what is happening now
- why this step is needed
- what VTDD will be able to do after this step

The surface must not depend on the human inferring that meaning from external
service terminology alone.

### 2. Keep The Human On One Coherent Path

The setup flow must feel like one continuous VTDD-guided path.

Short bounded redirects to GitHub or Cloudflare may still exist during the
bootstrap era, but they do not qualify as wizard behavior by themselves.

VTDD must preserve continuity by making clear:

- where the human is leaving VTDD
- why VTDD is sending them there
- what information VTDD expects to receive back
- what will happen immediately after they return

### 3. Hide Cross-Service Wiring As Much As Possible

The human should not need to become the translator between:

- GitHub App screens
- Cloudflare Worker secret screens
- runtime secret names
- installation IDs
- token classes

When the human is required to carry values across surfaces manually, that
requirement must be treated as bootstrap debt, not as the desired steady state.

### 4. Explain Remaining Manual Steps In VTDD Terms

When a manual step is still unavoidable, VTDD must explain it in product terms,
not only service-provider terms.

Good explanation:

- "VTDD needs permission to read and write against your GitHub installation."
- "VTDD needs one bounded bootstrap credential to store runtime secrets on this Worker."

Insufficient explanation:

- "open this page and paste this secret"
- "copy the number from this URL"

### 5. Make Success Legible

The human must be able to tell when setup meaningfully advanced.

This requires setup/status surfaces to answer in user-facing terms:

- what is already connected
- what is still missing
- what VTDD can do now
- what VTDD still cannot do

Diagnostics may expose deeper evidence for operators, but the top-level reading
must remain human-legible.

## What Does Not Count As A Wizard

The current surface should be read as a bootstrap helper when any of these are
true:

- the human follows the steps but still does not know what they are doing
- the human must discover IDs or secrets by reading service-specific URLs or
  admin pages without VTDD explaining their role
- the human must carry values across services with little or no narrative
  continuity
- the human must understand GitHub App, Cloudflare token, or Worker secret
  models in order to continue safely
- setup completion is judged mainly by operator diagnostics rather than by a
  clear user-facing "VTDD can now do X" state

In that state, `/setup/wizard` is still better described as a bounded bootstrap
helper.

## Current Reading Of VTDD

Current VTDD setup is not yet a full wizard.

It still depends on the human to bridge cross-service handoffs involving:

- GitHub App creation
- GitHub App installation capture
- Cloudflare bootstrap token management
- Worker secret rotation
- private key and installation identifier handling

This does not mean the current work was wasted.
It means the repository has now made the hidden complexity visible enough to
define the next acceptance criteria correctly.

## Acceptance Criteria For Future Runtime Work

Future setup-wizard runtime slices should be judged against all of these:

1. The human can tell what VTDD is doing now and why.
2. The human can tell what changed after a step succeeds.
3. A required external redirect is narrated before and after the jump.
4. Manual copy/paste, if still required, is described as temporary bootstrap
   debt and minimized.
5. VTDD status surfaces explain connection state in user terms first, operator
   diagnostics second.
6. A human following the intended path should not need to infer the underlying
   system architecture just to continue.

If a runtime slice improves cosmetics while leaving these failures intact, it
must not be described as completing setup wizard behavior.

## Relationship To Existing Bootstrap Docs

- `docs/security/bootstrap-automation-model.md` defines the boundary split and
  service connection model.
- this document defines the user-facing bar for calling the entry surface a
  wizard at all.
- `docs/mvp/bootstrap-plan.md` should continue to treat repository completion
  as partial until the setup path becomes meaningfully usable, not merely
  technically reachable.
