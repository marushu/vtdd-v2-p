# Deploy Authority Branching

This document records the deploy authority branching proposal for VTDD v2.
It exists to support a spec issue and does not change runtime behavior by
itself.

## Problem

The current MVP deploy path assumes:

- GitHub Actions is the production deploy executor
- GitHub holds deploy secrets or environment approval

That works well when repository protection features are available, but it is a
bad fit for:

- private repositories on GitHub Free
- solo operators who do not want to buy GitHub Pro only for branch protection
- deployments where VTDD should remain the high-risk control plane

## Desired Invariant

Production deploy must remain a VTDD-governed high-risk action.

Required invariants:

- deploy requires `GO + passkey`
- deploy authority must be short-lived or one-shot
- GitHub Actions must not require permanent production deploy authority
- a mistaken push to `main` must not immediately imply production deploy

## Detection Strategy

VTDD can detect whether GitHub-hosted branch protection style enforcement is
available.

Suggested detection signals:

- repository visibility (`public` / `private`)
- branch protection API availability
- rulesets API availability
- optional explicit operator preference override

Suggested interpretation:

- if GitHub protection APIs are available and repository policy wants them,
  GitHub-assisted deploy flow may be used
- if protection APIs are unavailable or rejected, VTDD must fall back to a
  provider-agnostic deploy authority path

Important:

- detection is for choosing deploy authority strategy
- detection must not redefine VTDD safety invariants
- GitHub-hosted protection is optional hardening, not the root safety model

## Candidate Deploy Authority Paths

### Path A: VTDD -> one-shot GitHub Actions deploy

Flow:

1. Operator gives `GO + passkey`
2. VTDD mints or injects one-shot deploy credential
3. VTDD triggers a deploy-only workflow
4. credential expires immediately after the run

Pros:

- preserves familiar GitHub Actions execution environment
- minimal change to current operational flow
- keeps permanent production secrets out of GitHub

Cons:

- still depends on GitHub as deploy runner
- requires careful one-shot secret injection / revocation design

### Path B: VTDD -> direct provider deploy

Flow:

1. Operator gives `GO + passkey`
2. VTDD obtains short-lived provider credential
3. VTDD deploys directly to Cloudflare Workers

Pros:

- cleaner separation between source control and deploy authority
- less GitHub-specific coupling
- a push to `main` does not share execution authority with deploy path

Cons:

- more deploy logic moves into VTDD runtime
- audit and rollback flow must be designed explicitly

### Path C: VTDD -> SSH / external runner

This path is intentionally deferred.

Reasons:

- key handling and host command restriction are easy to get wrong
- blast radius can become larger than GitHub/Cloudflare-scoped credentials
- should not be chosen before credential lifecycle and audit model are stable

## Recommended Direction

Near-term recommendation:

- keep Path A as the first implementation candidate
- keep Path B as the preferred portability-oriented follow-up
- keep Path C out of current MVP scope

Reason:

- Path A changes the least while removing always-on deploy authority from
  GitHub
- Path B remains available if stronger de-GitHub separation is needed later

## Non-goals

- automatic deploy on every merge to `main`
- permanent production secrets in GitHub Actions
- redefining merge authority (merge remains human)
- introducing SSH-based production authority in the same scope
