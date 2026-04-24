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

The first implementation path is GitHub Actions centered.

- Butler triggers a VTDD-managed workflow dispatch
- the workflow runs Codex CLI remotely
- the workflow operates on the target repository and branch
- progress is observed through GitHub Actions run state plus VTDD execution logs

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

## One-slice Goal

The bounded goal of this executor slice is:

- start remote Codex CLI from VTDD
- reach PR creation or PR update
- expose enough progress for Butler to continue the loop
