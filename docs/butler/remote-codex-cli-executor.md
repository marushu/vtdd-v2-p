# VTDD-managed Remote Codex CLI Executor

This document is the canonical runtime contract for Issue #6.

## Purpose

VTDD must be able to launch remote Codex CLI execution from Butler without
requiring a human to manually operate a terminal.

This executor is not a replacement for Issue-as-spec.
It is the transport that moves bounded, approved execution into a remote Codex
run and returns observable progress back to Butler.

## Canonical Shape

`Butler -> VTDD runtime -> remote Codex CLI -> PR create/update`

This slice exists specifically so the loop can continue into:

- `PR -> Gemini critical review comments`
- `Gemini comments -> Butler synthesis`

## Transport Principle

The implementation must preserve a no-extra-API-cost default for operators who
already use Codex through a ChatGPT/Codex subscription.

The GitHub Actions Codex CLI runner is an optional `api_key_runner`, not the
default account model. It requires `OPENAI_API_KEY` and may create separate API
billing from a ChatGPT/Codex subscription.

The default operator path is GitHub-centered Codex Cloud delegation through the
operator's own ChatGPT/Codex GitHub integration.

VTDD expresses that delegation as a bounded GitHub Issue or PR comment that
mentions `@codex`. This lets the operator's existing Codex Cloud entitlement
pick up the work through GitHub without requiring `OPENAI_API_KEY`.

This path depends on the operator having connected Codex Cloud to GitHub in
their own ChatGPT/Codex account. VTDD must surface that as operator-owned
configuration, not as a repository secret owned by this public repo.

Codex Cloud is the default account-backed executor path. `OPENAI_API_KEY`
runners are optional opt-in machine paths only.

## Default Codex Cloud GitHub Comment Runner

The default no-extra-API-cost runner is:

- Butler builds a bounded execution contract from Issue and GitHub runtime truth
- VTDD posts that contract as a GitHub comment containing `@codex`
- Codex Cloud, running under the operator's ChatGPT/Codex account, picks up the task
- Codex creates or updates a PR
- Butler tracks progress from the delegation comment, branch, and PR state

This runner does not use `OPENAI_API_KEY`.

## Optional API-backed Runner

The optional machine-runner implementation path is GitHub Actions centered.

- Butler triggers a VTDD-managed workflow dispatch
- the workflow runs Codex CLI remotely
- the workflow operates on the target repository and branch
- progress is observed through GitHub Actions run state plus VTDD execution logs

This path must remain explicit opt-in because it depends on `OPENAI_API_KEY`.
Do not present it as the only VTDD remote executor path.

## Required Inputs

- target repository
- target Issue number
- target branch
- base ref for branch creation when the target branch does not yet exist
- codex goal (`open_pr` / `revise_pr` / `respond_to_review`)
- approval phrase / scoped approval context
- optional handoff payload, only when Butler-mediated transfer requires it

## Required Boundaries

- Butler must still consult Issue and runtime truth before execution
- unresolved target blocks execution
- missing scoped approval blocks execution
- missing handoff blocks execution only when handoff is required
- remote executor does not merge
- remote executor does not replace reviewer judgment

## Progress Contract

Butler must be able to ask:

- was execution queued?
- is it running?
- did it finish?
- which workflow run corresponds to the execution request?

Progress must be reconstructable from:

- GitHub Actions run state
- VTDD execution log
- branch / PR state in GitHub runtime truth

When Codex reaches an approval or scope boundary, the observable return path is
GitHub state that Butler can read, not a hidden direct Codex-to-Butler channel.

## One-slice Goal

The bounded goal of this executor slice is:

- start remote Codex CLI from VTDD
- reach PR creation or PR update
- expose enough progress for Butler to continue the loop

When using the optional API-backed runner, completion evidence must state that
the run used the API-backed path. When using a no-extra-API-cost path,
completion evidence must state the Codex surface used for execution.
