# GitHub Operation Plane

This document is the canonical GitHub operation plane contract for Issues #42
and #244.

## Intent

VTDD must treat GitHub App-backed GitHub REST API capability as a broad
operation plane, not as a narrow collection of convenience endpoints.

Capability narrowing is prohibited.

Execution control must be enforced by approval tiers, not by shrinking what
Butler and Executor can conceptually reach.

## Core Rule

GitHub operation capability is full-scope by default.

That means VTDD must reason from:

- broad GitHub REST API capability
- GitHub App as the credential model
- short-lived execution ability minted when needed
- approval tiers that decide whether a given operation may execute now

It must not reason from:

- a small hand-picked subset of repository endpoints
- an MVP reinterpretation that silently drops GitHub capability
- a narrow Butler surface being mistaken for the underlying capability model

## Capability Narrowing Is Prohibited

The following interpretation drift is forbidden:

- `repo list works, therefore current GitHub capability is enough`
- `Issue list is not exposed yet, therefore VTDD does not need it`
- `MVP means only the currently exposed endpoints`
- `surface limitation defines system capability`

VTDD may expose GitHub capability in slices for implementation order, but the
canonical capability model remains broad and full-scope.

## Credential Model

- GitHub App is the canonical credential model.
- Long-lived PAT-style execution tokens must not be introduced as the default.
- Short-lived GitHub execution tokens are minted only when needed and discarded
  after use.
- GitHub App capability is execution ability, not standing permission to act
  without approval.

## Approval Tiers

Execution is controlled by approval tiers:

- `read`
- `GO`
- `GO + real passkey`

These tiers constrain execution now.
They do not define which GitHub capability exists conceptually.

## Canonical Coverage

Issue #244 supersedes the earlier basic matrix in #153. The capability model is
owner-equivalent by inventory: every GitHub repository-owner operation family is
in scope even when its current Butler action surface is not implemented yet.

The queryable source of truth for Butler operation explanations is
`src/core/github-owner-operation-inventory.js`. Each inventory row records:

- status: `supported`, `gated`, `unsupported`, or `intentionally_blocked`
- required GitHub App permission
- required Butler action surface
- required passkey/operator boundary
- runtime truth verification method
- remediation issue when unsupported

At minimum, the GitHub operation plane covers these operation groups, and the
list must not be used to narrow the scope to examples only:

- repositories
- issues
- issue comments
- pulls
- pull files and diff metadata
- reviews and review comments
- checks, statuses, and workflow runs
- branches and refs
- merge
- issue close
- PR close / reopen / state transition
- Issue body, title, state, label, assignee, and milestone update
- deploy-adjacent GitHub mutations
- secret, variable, and settings mutations
- repository settings, rulesets, environments, pages, and webhooks
- repository permissions, collaborators, teams, and GitHub App installation state
- releases, tags, and packages
- deployments, environments, and deployment statuses
- repository archive, delete, transfer, visibility, and destructive cleanup

Unsupported rows are not treated as a steady-state GitHub UI fallback. They must
name a remediation Issue and Butler must explain that the owner operation is in
scope but lacks a governed action surface today.

Intentionally blocked rows are still inventory rows. Butler must refuse them
explicitly instead of pretending they do not exist or silently narrowing the
owner-equivalent model.

## Tier Mapping

### `read`

Read-only GitHub runtime truth includes at least:

- repository discovery and repository detail
- Issue list/detail
- Issue comments
- PR list/detail
- pull files / diff metadata
- review comments and reviews
- checks, statuses, and workflow runs
- branches and refs

### `GO`

Normal bounded execution includes at least:

- issue creation and bounded issue update
- issue comments
- branch creation for scoped work
- commit and push on the scoped topic branch
- PR creation and update
- PR comment and bounded review-response work
- deletion of the merged topic branch tied to that scoped PR

### `GO + real passkey`

High-risk GitHub execution includes at least:

- merge
- bounded issue close after merged scoped work
- repository or environment secret mutation
- repository or environment variable mutation
- GitHub App install, credential, token, or permission mutation
- repository settings mutation
- branch protection, ruleset, or environment protection mutation
- collaborator, team, or permission mutation
- repository archive, delete, transfer, or visibility change
- destructive workflow, release, branch, tag, or environment mutation outside
  the bounded post-merge cleanup path
- deploy-triggering high-risk repository mutation

`passkey` here means real WebAuthn/passkey authentication, not a phrase typed
into chat.

## Butler / Codex Boundary

- Codex may execute freely inside bounded Issue scope.
- Codex does not merge or close issues directly.
- Merge and issue close remain Butler-side authority actions.
- Butler uses GitHub App short-lived execution ability after the required
  approval tier is satisfied.

## Never Auto

The existence of GitHub App capability must never be reinterpreted as
permission to auto-execute:

- milestone completion judgment
- unscoped issue closure
- repository administration mutation
- destructive cleanup outside the bounded current work window
- approval-bound action from repository state alone

## Relationship To Surface Design

Butler surface design may be implemented in slices.

That implementation order does not redefine the GitHub operation plane.

A missing read/write route means:

- that route is not implemented yet

It does not mean:

- the capability is out of VTDD scope
- the capability may be dropped from canonical design

## Non-goals

- implementing every GitHub route in one PR
- replacing GitHub App with a different default credential model
- allowing Codex to merge directly
- treating partial surface exposure as VTDD completion
