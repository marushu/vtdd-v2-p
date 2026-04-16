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

## Docs-First Gate

If canonical docs referenced by parent planning Issues are missing, restore docs first.
Do not start feature implementation on a broken canonical baseline.

For this repo, missing canonical docs are blocking work, not optional cleanup.

## Issue Lifecycle Gate

Issue closure is allowed only when all are true:

1. Code implementing the scoped criteria is merged.
2. Required tests pass.
3. Mapped E2E scenario(s) pass with evidence.
4. Human explicitly approves closure.

Manual closure without these four conditions is prohibited.

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
- Credential model is GitHub App.
- High-risk credential is short-lived and approval-bound.
- Memory excludes secrets and raw sensitive material.
- Reviewer role does not get execution credentials.

## Conversation UX Contract

- User-facing operational guidance is Japanese by default unless user requests otherwise.
- Do not require users to type internal API paths (for example `/mvp/...`) for normal operation.
- Do not require raw JSON payload authoring for normal operation.
- Convert natural conversation intent into internal action calls.
- If target repository is ambiguous, ask a short confirmation before switching.

## Change Size and PR Discipline

- Prefer one bounded Issue slice per PR.
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

If evidence is missing, status must be "unverified" or "incomplete", never "done".

If scope ambiguity, interpretation choice, or mismatch reconciliation occurred
during implementation, record that reasoning in the PR description.
PRs must not hide meaningful judgment history when that history explains why the
chosen change is in-scope and safe.

## Butler and Reviewer as Stop Roles

When available:

- Butler must surface missing scope, unresolved target, and approval boundary failures.
- Reviewer (Gemini initial) must be treated as a blocking risk signal, not decorative output.

Neither role may be bypassed by optimistic implementation assumptions.
