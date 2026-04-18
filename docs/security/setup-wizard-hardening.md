# Setup Wizard Hardening

## Goal

Treat setup wizard as a bootstrap entrypoint, not as a permanently public surface.

This document defines the current hardening direction for Issue #175.

It does not implement auth or bootstrap runtime by itself.

## Problem Reading

Current live/manual findings show:

- setup wizard is visible when the public worker URL is known
- live gateway behavior must not rely on fail-open machine-auth configuration
- bootstrap UX should stay iPhone-friendly, but setup access still needs a boundary

## Surface Split

### Setup Wizard Surface

`/setup/wizard` is a browser-facing bootstrap surface.

It exists to:

- show setup steps
- show contract summaries
- expose copy-ready Custom GPT construction/schema data
- optionally run diagnostics

It must not be treated like a permanently public brochure page.

### Internal API Surface

The following are internal execution surfaces:

- `/v2/gateway`
- `/v2/retrieve/constitution`
- `/v2/retrieve/decisions`
- `/v2/retrieve/proposals`
- `/v2/retrieve/cross`

These surfaces are machine-facing and must not depend on browser login.

## Required Boundary Direction

### Setup Wizard

Current reading:

- setup wizard should move behind an explicit bootstrap access boundary
- candidate boundary: Cloudflare Access OTP or equivalent short-friction user auth
- knowing the worker URL alone should not be enough to view setup wizard

### Internal API

Current reading:

- internal API should use machine auth only
- accepted modes remain:
  - bearer token
  - Cloudflare Access service token
- missing machine-auth runtime configuration must be treated as a blocking error, not an allow-all condition

This means `/v2/gateway` and `/v2/retrieve/*` should be fail-closed.

## Bootstrap UX Reading

The user should not be forced into an unsafe flow such as:

- pasting Cloudflare credentials into setup wizard
- passing credentials through hidden form fields
- carrying long-lived secrets through chat or URL parameters

The preferred UX direction is:

1. user reaches a protected setup entrypoint
2. setup wizard shows current contracts and diagnostics
3. if a privileged bootstrap step is needed, it happens in a separate narrow step
4. only non-secret outputs return to the main wizard

This preserves an iPhone-friendly setup flow without turning the main wizard into a secret intake surface.

Issue #181 allows a bounded exception:

- a passcode-authenticated bootstrap step may accept the GitHub App runtime trio
- the step must remain allowlisted and separate from normal read-only setup content
- it must not become a generic admin or secret console

## Non-goals

- fixing a specific auth vendor in this document
- implementing OAuth in this document
- adding generic secret input fields to the default setup wizard path
- using setup wizard as a generic admin console

## Current Reading

As of this audit phase:

- setup wizard public exposure is not considered the desired steady state
- internal API fail-open behavior is not considered acceptable for live/manual execution testing
- bootstrap hardening should happen before owner relies on iPhone manual testing as canonical proof
