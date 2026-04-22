# AGENTS.md

## Purpose

This repository is building VTDD V2 against active Issues.
The assistant must prevent drift, preserve issue traceability, and avoid speculative implementation.

This file exists to stop the exact failure mode where implementation appears to progress while required behavior remains unimplemented.

## Non-Negotiable Rules

1. Do not reinterpret scope words (including "MVP") on your own.
2. Do not silently downscope active Issues.
3. Do not close Issues automatically.
4. Do not merge on behalf of the user unless explicitly requested.
5. Do not implement behavior that cannot be traced to an Issue or approved doc.

If the user explicitly delegates implementation and merge authority for a
bounded Issue window, that delegation allows:

- implementation work within the named Issue scope
- PR creation
- PR review response and iteration
- merge only after scoped criteria, tests, and mapped E2E evidence are all present
- post-merge Issue closure and merged-branch deletion only after the same
  scoped criteria, tests, and mapped E2E evidence are all present

That delegation does not allow:

- changing the scoped Issue set by assumption
- declaring milestone-complete by implication
- deploy, credential mutation, permission mutation, or destructive operation
  without `GO + passkey`

## Canonical Source Order

When deciding what to implement, use this order:

1. Explicit user instruction in this thread
2. Active Issue text (Intent / Success Criteria / Non-goal)
3. Canonical docs referenced by the parent Issue (not ad hoc memory)
4. Existing code behavior

If these sources conflict, stop implementation and ask for a decision.
Never resolve source conflicts by assumption.

If current code only partially satisfies an Issue or contract, do not
"complete it on the fly" without first surfacing the mismatch explicitly.
When in doubt, stop and reconcile with the owner instead of pushing through.

## Active-Issue Coverage Policy

Default assumption: implementation scope covers all active Issues unless the user explicitly narrows scope.

Current repository execution note:

- when the user explicitly fixes the active implementation window to specific
  Issues, treat only those Issues as in-scope for implementation until the user
  re-opens the broader active-Issue set
- the historical setup-wizard line is archived; do not treat it as active
  implementation scope on this branch unless the user explicitly re-activates it
- this public/core branch does not use the setup wizard by default; do not
  inherit old wizard assumptions into current runtime or docs work

If any active Issue is intentionally deferred, record it explicitly as deferred with reason.
Never treat "not implemented yet" as "done".

## MVP Definition (Repository Rule)

In this repository, MVP is not "minimum guessed subset."
MVP is achieved only when all active Issues in scope are implemented and verified.

Prohibited:

- declaring MVP complete while any active required Issue remains unimplemented
- silently redefining MVP as a smaller subset
- reporting "overall done" from partial progress

Required:

- maintain an explicit active-Issue checklist
- map each active Issue to implementation evidence and E2E evidence
- report status as "partial/in-progress" until all required Issues are complete

## Drift Stop Protocol (Required Before Editing Code)

Before any runtime code edit, produce a bounded change contract:

- target Issue number(s)
- exact Success Criteria being implemented
- explicit Non-goals for this change
- files expected to change
- planned validation (unit/integration/E2E)

If a planned change cannot be mapped to an Issue section, do not implement it.
Either:
- propose a new Issue, or
- move the idea to proposal-only notes.

If implementation reveals a contract mismatch, missing requirement, ambiguous
boundary, or partial compliance state:
- stop the rollout
- summarize the exact mismatch
- state why continuing could create drift
- get explicit human direction before proceeding

Do not treat "this probably should be fixed now" as sufficient justification to
continue implementation.

For this public/core branch, the bounded change contract must also state when relevant:

- whether any archived wizard artifact is being changed, removed, or referenced
- whether any personal/operator-specific runtime URL, account identifier, or
  bootstrap value is touched, removed, or still referenced
- whether the change is safe for a repo intended to be usable by people other
  than the owner

## Docs-First Gate

If canonical docs referenced by parent planning Issues are missing, restore docs first.
Do not start feature implementation on a broken canonical baseline.

For this repo, missing canonical docs are blocking work, not optional cleanup.

## Issue Lifecycle Gate

Issue closure is allowed only when all are true:

1. Code implementing the scoped criteria is merged.
2. Required tests pass.
3. Mapped E2E scenario(s) pass with evidence.
4. A human has explicitly delegated or approved closure for the scoped work
   (for example via `GO` in a bounded execution window).

Even when the user delegates merge authority, keep milestone completion judgment
human-approved unless the user explicitly delegates that judgment.

Manual closure without these four conditions is prohibited.

Before writing `Closes #...` in a PR, explicitly verify:

1. the behavior is defined, not only described
2. the behavior is connected to a runnable execution path
3. Butler and/or worker can actually use that path to satisfy the Issue intent

If any of the three checks is false, do not write `Closes #...`.
Mark the PR as partial progress and name the missing connection(s).

Definition-only or canonicalization-only PRs must not close integration-facing
Issues by default.

## E2E-First Completion Contract

At milestone completion, create an Issue-to-E2E matrix.

Each active Issue must have at least:

- one happy-path scenario
- one boundary or failure-path scenario

If any Issue has no passing mapped E2E, repository status is incomplete.
Do not present overall completion as achieved.

MVP completion claim is allowed only when the matrix shows complete coverage for all required active Issues.

## Safety Invariants (Must Not Regress)

- Butler is context-first.
- Alias-based repository resolution exists.
- No default repository.
- Unresolved target blocks execution.
- High-risk actions require GO + passkey.
- Merge, post-merge Issue closure, and merged-branch deletion require explicit
  `GO`, not silent inference.
- Credential model is GitHub App.
- High-risk credential is short-lived and approval-bound.
- Memory excludes secrets and raw sensitive material.
- Reviewer role does not get execution credentials.
- Public-facing docs and runtime must not embed the owner's personal Cloudflare
  runtime URL or equivalent operator-specific runtime destination.
- Shared/public use must converge on user-owned GitHub, Cloudflare, Gemini,
  and ChatGPT accounts rather than the owner's accounts.
- Existing operator-specific bootstrap/runtime assumptions must not be silently
  carried into current main-line work.

## Archived Wizard Boundary

The setup-wizard line is historical on this branch.
Treat wizard-specific docs, tests, and behavior as archived research unless the
user explicitly re-activates them with a bounded Issue/spec.

On this branch:

- do not reintroduce setup wizard behavior, API shape, or completion claims by
  implication
- do not keep wizard-era docs as active canonical references when the files or
  runtime paths no longer exist
- if historical wizard material is kept for comparison, mark it explicitly as
  archive/historical rather than active scope

If the repository still contains owner-specific identifiers, links, script
names, URLs, or environment assumptions that would make the flow owner-only:

- stop and surface them explicitly
- remove or neutralize them before presenting the flow as reusable
- treat the presence of such values as a release blocker for shared/public use

If the owner delegates implementation while away from the keyboard, that
delegation still does not authorize speculative gap-filling. The assistant may
continue through PR creation and merge only while the current step remains
inside an explicitly stated contract. Stop when:

- a required platform capability is unknown or cannot be verified
- GitHub / Cloudflare / ChatGPT ownership semantics become ambiguous
- a change would expose or depend on owner-specific runtime state
- Issue / spec coverage for the current implementation slice is missing

## Authority Boundary

- `GO` may authorize bounded execution work including PR creation/update,
  merge, post-merge Issue closure, and merged-branch deletion.
- `GO` does not authorize deploy, credential mutation, permission mutation, or
  destructive/high-blast-radius operations.
- `GO + passkey` is required for deploy, credential mutation, permission
  mutation, destructive operations, and other high-risk external effects.
- Issue closure is allowed only after merge and only when scoped criteria,
  tests, and mapped E2E evidence are all present.
- Merged-branch deletion is allowed only for the branch merged by that scoped
  PR, not for unrelated branches.
- GitHub-side approval boundaries are canonicalized in
  `docs/security/consent-approval-model.md`.
- Treat GitHub App capability as execution ability, not as standing permission.
- Require `GO + passkey` for GitHub-side secret/variable mutation, GitHub App
  install or permission mutation, repository settings mutation, ruleset/branch
  protection mutation, collaborator mutation, repository archive/delete/transfer,
  and destructive cleanup outside the bounded post-merge path.
- Never auto-execute milestone completion judgment, unscoped Issue closure,
  repository administration mutation, or broad cleanup from repository state
  alone even if the GitHub App could technically perform it.

## Public Repo Collaboration Boundary

- For a public repository owned by a personal account, do not add human
  collaborators by default.
- Default external contribution path is fork + PR, not direct collaborator
  write access.
- Preserve owner-only administration for Actions settings, GitHub App setup,
  secrets, and other repository administration surfaces whenever possible.
- If a human collaborator is ever added, treat that as an explicit policy
  change and re-evaluate Issue close, secret, and execution-boundary risk.

## RAG Memory Capture and Cost Boundary

This section applies to RAG memory persistence only
(`decision_log` / `proposal_log` / `working_memory` and related memory records).
It must not be interpreted as a blanket prohibition for non-RAG operational logs.

- Do not persist full conversation transcripts into RAG memory by default.
- Persist only structured entries that improve future judgment or recovery.
- Selection must happen before RAG write (pre-write filter); do not "store all then trim later" by default.
- If temporary full-log capture into RAG memory is explicitly approved for a narrow case, it must include:
  - explicit Issue linkage,
  - retention TTL,
  - deletion plan,
  - owner approval note.
- Any PR that changes RAG memory write behavior must state expected write-volume/cost impact.

## Conversation UX Contract

- User-facing operational guidance is Japanese by default unless user requests otherwise.
- Do not require users to type internal API paths (for example `/mvp/...`) for normal operation.
- Do not require raw JSON payload authoring for normal operation.
- Convert natural conversation intent into internal action calls.
- If target repository is ambiguous, ask a short confirmation before switching.

## Change Size and PR Discipline

- Prefer one bounded Issue slice per PR.
- Do not develop directly on `main`.
- Start by syncing the latest `main`, then create a topic branch before making changes.
- Do implementation work on the topic branch, push that branch to remote, and open a PR targeting `main`.
- If work has already started on `main`, stop and move the in-progress changes onto a topic branch before continuing.
- No "while we are here" edits.
- No unrelated refactors in implementation PRs.
- Keep docs-only PRs and runtime PRs separable when possible.
- If a new guardrail or process correction is needed, land it in its own PR
  rather than mixing it into an implementation slice.

## Evidence Discipline

Any completion claim must include evidence:

- relevant file path(s)
- test result(s)
- E2E run result(s)

Issue authoring must keep completion unambiguous:

- each Success Criteria must be observable/testable (not abstract wording only),
- completion must be judgeable without interpretation drift.

PR authoring must include executed verification, not intent only:

- what was tested,
- how it was tested,
- what passed/failed,
- where evidence can be found.

If evidence is missing, status must be "unverified" or "incomplete", never "done".

If scope ambiguity, interpretation choice, or mismatch reconciliation occurred
during implementation, record that reasoning in the PR description.
PRs must not hide meaningful judgment history when that history explains why the
chosen change is in-scope and safe.

If a PR only establishes schema, docs, contracts, or templates, say so plainly.
Do not imply end-to-end behavior exists unless it is demonstrably reachable from
Butler/worker execution.

When an Issue expects VTDD to behave in a user-observable way, stop and verify:

- what the user is expected to do
- what Butler/worker is expected to execute
- what evidence proves that behavior actually works

If those answers are incomplete, stop before presenting the PR as completion.

## Butler and Reviewer as Stop Roles

When available:

- Butler must surface missing scope, unresolved target, and approval boundary failures.
- Reviewer (Gemini initial) must be treated as a blocking risk signal, not decorative output.

Neither role may be bypassed by optimistic implementation assumptions.
