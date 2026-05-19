# Passkey Approval Model

This document focuses on the highest-risk approval path.
For the full canonical consent / approval model, see
[consent-approval-model.md](./consent-approval-model.md).

## Intent

High-risk actions should require explicit scoped intent and strong user authentication.
Merge and bounded post-merge completion tasks are part of the high-risk set and
must follow the same scoped passkey approval path as other authority-bearing
actions.

## Drift Note

Historically, the repo used phrase-based `GO + passkey` confirmation inside
policy payloads. That phrase gate is not itself a real passkey ceremony.

The executable runtime path for real WebAuthn/passkey verification is tracked in
[webauthn-passkey-runtime.md](./webauthn-passkey-runtime.md).

## Approval Levels

### Level 1

- read
- summarize
- explore

No explicit approval required.

### Level 2

- issue creation
- branch / PR operations
- normal execution
- merged-branch deletion for the scoped PR

Requires `GO`.

### Level 3

- merge
- post-merge issue close for the scoped work
- production deploy
- credential mutation
- permission mutation
- destructive actions
- external publish

Requires scoped passkey approval.

## GitHub-side High-risk Examples

When the execution surface is GitHub, scoped passkey approval covers at least:

- pull request merge
- bounded issue close for the scoped merged work
- repository or environment secret / variable mutation
- GitHub App installation, credential, token, or permission mutation
- repository settings mutation
- ruleset / branch protection / environment protection mutation
- collaborator / team / permission mutation
- repository archive / delete / transfer / visibility change
- destructive workflow, release, branch, tag, or environment mutation outside
  the bounded post-merge cleanup path

These operations may be technically possible for the GitHub App, but VTDD must
still block them until explicit scoped passkey approval succeeds.

## Never-auto Boundary

Scoped passkey approval is a required unlock for high-risk execution, but it does not
convert GitHub state changes into auto-permitted behavior. VTDD must still
forbid automatic:

- milestone completion judgment
- issue closure without scoped linkage to merged work
- repository administration changes inferred from convenience
- destructive cleanup outside the currently scoped work window

## Approval Components

- the passkey approval screen confirms human intent by showing the exact scope
  before approval
- `passkey` confirms user identity
- a short-lived credential enables the action.

## Required High-risk Flow

1. Resolve target repository and action.
2. Summarize impact.
3. Show the exact approval scope on the same-origin passkey page.
4. Complete passkey approval.
5. Mint short-lived approval grant / credential.
6. Execute once.
7. Write audit log.

## Device Principle

This model must remain device-agnostic.
It should work with iPhone, iPad, Android, web, and future native clients through passkey-capable device authentication.

## Non-goals

- requiring passkey for every action,
- allowing passkey approval without visible scope,
- tying approval to a single platform vendor.
