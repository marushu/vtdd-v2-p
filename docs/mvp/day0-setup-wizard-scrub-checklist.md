# Day0 Setup Wizard Scrub Checklist

## Purpose

List the owner-specific values and assumptions that must be removed or
neutralized before VTDD can be presented as reusable by invited users other
than the owner.

This checklist is a release blocker for shared/public setup work.

## Owner-Specific Values To Remove Or Neutralize

- owner-specific `workers.dev` runtime URLs
- owner-specific Worker script names when presented as shared defaults
- owner-specific Cloudflare account identifiers in shared/public docs
- owner-specific bootstrap links embedded in public setup surfaces
- owner-specific passcodes or setup phrases in source, docs, or public HTML
- owner-specific repository assumptions that imply only the owner can operate

## Code And Surface Review Targets

Review at minimum:

- public website content under `vtdd.hibou-web.com`
- setup-wizard routes and rendered HTML
- onboarding docs that still narrate an owner-seeded runtime as the target
- tests and fixtures that may freeze owner-specific example values as product
  defaults

## Required Shared-Use Readings

Before calling the Day0 wizard reusable, confirm all are true:

1. no public page redirects into an owner-specific runtime
2. no shared/public setup copy tells the user to operate on the owner's account
3. any example runtime target is clearly marked as example-only, not a live
   personal destination
4. setup status is expressed in user-owned terms
5. unresolved owner-specific values are reported as blockers, not ignored

## Runtime Ownership Checklist

Before any implementation slice is presented as progress on shared-use setup:

- GitHub destination is described as user-owned
- Cloudflare runtime destination is described as user-owned
- Cloudflare runtime URL is treated as internal setup state, not as a default
  wizard display value
- Gemini key storage destination is described as the user-owned runtime
- ChatGPT entry is described as shared VTDD GPT usage after setup, not as an
  owner-only shortcut
- Codex handoff is described as continuing from the same user-owned repository
  and runtime, not as an owner-only local workspace shortcut

## Non-Claim

Passing this checklist does not mean Day0 wizard is complete.

It only means the repository and public surfaces are no longer obviously bound
to the owner's personal runtime assumptions.
