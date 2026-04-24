# GO + Passkey Approval Model

This document focuses on the highest-risk approval path.
For the full canonical consent / approval model, see
[consent-approval-model.md](./consent-approval-model.md).

## Intent

High-risk actions should require both explicit intent and strong user authentication.
Merge and bounded post-merge completion tasks remain explicit `GO` actions, but
they are not part of the `GO + passkey` set.

## Drift Note

Historically, the repo used phrase-based `passkey` confirmation inside policy
payloads. That phrase gate is not itself a real passkey ceremony.

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
- merge
- post-merge issue close for the scoped work
- merged-branch deletion for the scoped PR

Requires `GO`.

### Level 3

- production deploy
- credential mutation
- permission mutation
- destructive actions
- external publish

Requires `GO + passkey`.

## GitHub-side High-risk Examples

When the execution surface is GitHub, `GO + passkey` includes at least:

- repository or environment secret / variable mutation
- GitHub App installation, credential, token, or permission mutation
- repository settings mutation
- ruleset / branch protection / environment protection mutation
- collaborator / team / permission mutation
- repository archive / delete / transfer / visibility change
- destructive workflow, release, branch, tag, or environment mutation outside
  the bounded post-merge cleanup path

These operations may be technically possible for the GitHub App, but VTDD must
still block them until explicit scoped `GO + passkey` succeeds.

## Never-auto Boundary

`GO + passkey` is a required unlock for high-risk execution, but it does not
convert GitHub state changes into auto-permitted behavior. VTDD must still
forbid automatic:

- milestone completion judgment
- issue closure without scoped linkage to merged work
- repository administration changes inferred from convenience
- destructive cleanup outside the currently scoped work window

## Approval Components

- `GO` confirms human intent.
- `passkey` confirms user identity.
- a short-lived credential enables the action.

## Required High-risk Flow

1. Resolve target repository and action.
2. Summarize impact.
3. Receive `GO`.
4. Complete passkey approval.
5. Mint short-lived credential.
6. Execute once.
7. Write audit log.

## Device Principle

This model must remain device-agnostic.
It should work with iPhone, iPad, Android, web, and future native clients through passkey-capable device authentication.

## Non-goals

- requiring passkey for every action,
- allowing passkey without `GO`,
- tying approval to a single platform vendor.
