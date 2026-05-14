# GitHub App Actor Identity

This document is the canonical actor identity contract for Issue #351.

## Purpose

VTDD must make GitHub-visible comments and write operations visually traceable
to the role that performed them.

The owner account `marushu` should appear only for owner actions such as manual
merge, close, or repository administration. Normal VTDD machine activity must
use a role-specific GitHub App token so GitHub displays the bot name and icon
for that role.

## Actors

| Role | GitHub-visible actor | Workflow / runtime path | Secret names |
| --- | --- | --- | --- |
| Butler | `VTDD Butler V2` | Custom GPT Action runtime | Runtime-owned Butler credentials |
| Legacy Codex executor | `vtdd-codex` | `.github/workflows/remote-codex-executor.yml` with `codex_actor=vtdd-codex` | `VTDD_GITHUB_APP_ID`, `VTDD_GITHUB_APP_PRIVATE_KEY` |
| mac Codex executor | `VTDD mac Codex` | `.github/workflows/remote-codex-executor.yml` with `codex_actor=mac-codex` | `VTDD_MAC_CODEX_APP_ID`, `VTDD_MAC_CODEX_APP_PRIVATE_KEY` |
| VPS Codex CLI executor | `VTDD VPS Codex CLI` | `.github/workflows/remote-codex-executor.yml` with `codex_actor=vps-codex-cli` | `VTDD_VPS_CODEX_CLI_APP_ID`, `VTDD_VPS_CODEX_CLI_APP_PRIVATE_KEY` |
| Gemini reviewer | `VTDD Gemini Reviewer` | `.github/workflows/gemini-pr-review.yml` | `VTDD_GEMINI_REVIEWER_APP_ID`, `VTDD_GEMINI_REVIEWER_APP_PRIVATE_KEY` |
| Codex fallback reviewer | `VTDD Codex Fallback Reviewer` | `.github/workflows/codex-pr-review-fallback.yml`; VPS fallback writeback path | `VTDD_CODEX_FALLBACK_REVIEWER_APP_ID`, `VTDD_CODEX_FALLBACK_REVIEWER_APP_PRIVATE_KEY`, `VTDD_CODEX_FALLBACK_REVIEWER_APP_INSTALLATION_ID` on VPS |
| Owner | `marushu` | Manual GitHub UI / owner-authorized administration | Owner login only |

## Authority Boundary

Role-specific GitHub Apps make the actor visible. They do not grant standing
permission to act.

- Reviewer Apps are critique-only. They may read the PR context and write
  reviewer comments, but must not receive execution, merge, deploy, credential
  mutation, or repository administration authority.
- Executor Apps may push bounded branch changes and create/update PRs only when
  the scoped execution contract authorizes that work.
- Merge, post-merge Issue closure, deploy, credential mutation, permission
  mutation, and destructive operations still follow the repository authority
  boundary in `AGENTS.md` and `docs/security/consent-approval-model.md`.
- GitHub App installation, permission, and Actions secret mutation require
  `GO + passkey`.

## Secret Registration Boundary

This repository can define the required secret names and route workflows through
them. Registering or updating those secrets is a high-risk external effect and
is not completed by code changes alone.

Before production use, the owner must approve syncing the App IDs and private
keys into GitHub Actions secrets with `GO + passkey`.

Until the new secrets are configured:

- Gemini review skips explicitly rather than posting as the wrong actor.
- Codex fallback reviewer fails explicitly rather than posting as the wrong
  actor.
- Remote Codex executor keeps `vtdd-codex` compatibility by default and uses
  `mac-codex` or `vps-codex-cli` only when that actor is selected and its
  secrets are configured.

## Incident Visibility

Actor identity failures are recovery incidents, not silent script failures.

If the VPS fallback path cannot mint a `VTDD Codex Fallback Reviewer`
installation access token, it must not post the completed reviewer marker as
`marushu`. When `VTDD VPS Codex CLI` credentials are available, the VPS runner
posts a Japanese-first `@marushu` incident comment instead:

- first line is readable from iPhone / Apple Watch notifications,
- body includes `<!-- vtdd:incident=actor_identity_failure -->`,
- body names the expected actor, detected-by actor, affected PR, and next
  credential setup action.

If the VPS notifier App token is also unavailable, the runner must fail closed
and log the incident reason. That state is incomplete for normal VTDD recovery
until startup preflight can surface the incident through Butler / mac Codex /
VPS Codex CLI.
