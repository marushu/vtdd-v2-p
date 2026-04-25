# Butler-Codex-Human Authority Model

This document is the canonical authority model for Issue #45.

## Purpose

VTDD must preserve a clear authority split:

- Codex is the executor
- Butler is the judgment and authority gateway
- Human is the final authority

This model exists so Codex can act with high freedom inside bounded Issue
scope without silently taking authority actions such as merge or issue close.

## Core Definition

- Issue is the canonical execution spec.
- GitHub runtime truth is the canonical current-state surface.
- Codex is free inside bounded Issue scope.
- Codex is not the spec authority.
- Codex does not merge or close issues directly.
- Butler performs authority-gated GitHub actions after human approval.
- Human remains the final authority for merge, close, deploy, permission, and
  credential decisions.

## Role Definitions

### Butler

Butler:

- reads Issue, PR, review comments, CI, and runtime truth
- decides whether execution may continue safely
- summarizes reviewer objections and unresolved risk
- requests human approval when authority boundaries are reached
- executes Butler-side GitHub authority actions through GitHub App after the
  required approval tier succeeds

Butler is the only role in this model that may bridge human approval into
GitHub authority actions.

### Codex

Codex:

- performs bounded coding work inside approved Issue scope
- creates and updates branches, commits, and PRs within that scope
- responds to review comments within approved scope
- may choose implementation details freely inside that scope

Codex must not:

- redefine spec
- silently widen Issue scope
- merge
- close issues
- perform Butler-side authority actions

### Human

Human:

- approves execution continuation when needed
- approves merge and issue close through Butler
- completes real passkey/WebAuthn approval for high-risk actions
- remains the final authority for milestone judgment

## Codex Default Path

The default Codex executor path is:

- ChatGPT Pro / Codex Cloud

The canonical remote path is GitHub-centered delegation through the operator's
own Codex Cloud GitHub integration.

`OPENAI_API_KEY`-backed runners are optional opt-in machine paths, not the
default VTDD executor model.

## Authority Return Contract

Codex does not return to Butler through an invisible private chat channel.

Codex returns control through GitHub-observable runtime truth that Butler can
read. Canonical return surfaces are:

- PR state
- Issue comments
- PR comments
- review replies
- structured delegation/progress comments

When Codex reaches a boundary that requires Butler/human action, it must leave
GitHub-observable evidence that Butler can read and summarize.

## Canonical Return Markers

At minimum, the authority return contract recognizes these marker states:

- `approval_required`
- `scope_ambiguous`
- `review_response_needed`
- `blocked_by_missing_runtime_state`

Meaning:

- `approval_required`
  Codex has reached a boundary that requires Butler to obtain human approval
  before continuing.
- `scope_ambiguous`
  Codex cannot continue safely because Issue scope or bounded intent is not
  clear enough.
- `review_response_needed`
  reviewer objections or PR discussion require Butler/human judgment before the
  next bounded execution step.
- `blocked_by_missing_runtime_state`
  Codex cannot continue because required GitHub/runtime truth is missing,
  unreadable, or inconsistent.

## Merge And Close Authority

Merge and issue close are Butler-side authority actions.

Canonical path:

1. Codex creates or updates the PR
2. reviewer returns critique
3. Butler summarizes PR / review / CI state
4. human requests merge or close
5. Butler verifies approval tier
6. Butler uses GitHub App short-lived execution ability to perform the action

Codex does not perform merge directly.

## Approval Boundary

- read-only GitHub observation does not require merge authority
- normal bounded execution follows the normal execution approval tier
- merge and bounded issue close require explicit `GO`
- deploy, credential mutation, permission mutation, and destructive actions
  require `GO + real passkey`

`passkey` in this model means real WebAuthn/passkey authentication, not a chat
phrase.

## Desktop Maintenance Required

If required operator-owned root credential maintenance can only continue from
desktop bootstrap state, Butler must stop and surface:

- `desktop maintenance required`

This is not a Codex-side authority return marker. It is a Butler runtime state
that blocks further authority action until the desktop bootstrap path is used.

## Non-goals

- replacing GitHub runtime truth with Codex summaries
- allowing Codex to merge directly
- making API-backed Codex runners the default path
- collapsing Butler and Codex into one authority role
