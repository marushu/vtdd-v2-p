# PR-triggered Gemini Review Comments

This document is the canonical runtime contract for Issue #9.

## Purpose

After Remote Codex reaches PR creation/update, VTDD must be able to run Gemini
as the critical reviewer and return that critique to GitHub as PR comments.

This slice does not summarize review output for the human yet.
Its purpose is to make the `PR -> Gemini` part of the loop runnable and
traceable.

## Canonical Shape

`Remote Codex -> PR create/update -> Gemini review workflow -> PR comment`

This review comment then becomes the GitHub-centered reviewer surface that
Butler will later read and synthesize.

## Trigger Boundary

Gemini review must run when:

- a PR is opened
- a PR is updated
- a PR becomes ready for review
- new PR comments or review comments arrive

If Gemini is temporarily unavailable because of quota exhaustion, rate
limiting, or transient provider high demand / temporary unavailability, VTDD
must not hard-fail the PR solely for reviewer availability reasons.

Preferred fallback:

- VTDD posts or updates a `vtdd:reviewer=codex-fallback` request comment that
  contains an `@codex review` request for Codex Cloud
- the default request path does not use `OPENAI_API_KEY`
- the request remains request-state until Codex returns a completed fallback
  reviewer marker with a recommended action

When Gemini is temporarily unavailable, a completed
`vtdd:reviewer=codex-fallback` marker comment with a recommended action is
valid fallback reviewer evidence only when it is written by a trusted
VTDD-controlled actor or by the Codex Cloud reviewer result path. Butler must
not treat the absence of GitHub Review API objects alone as absence of reviewer
evidence, but it must not trust spoofable marker comments from untrusted
authors.

Current limitation:

- a VTDD bot-authored `@codex review` request proves only that fallback was
  requested; it is not completed reviewer evidence by itself
- if Codex Cloud does not pick up the request, VTDD must keep the fallback state
  as requested or blocked rather than pretending review completed

## Operator Prerequisite

For the default non-manual Codex fallback to reach a `completed` reviewer
state, the operator-owned Codex Cloud / ChatGPT GitHub integration must pick up
the PR comment request and return reviewer output.

Optional API-backed runner:

- `OPENAI_API_KEY` may be configured only for an explicit opt-in Codex workflow
  fallback path
- this API-backed path is a cost/account deviation and must not be the silent
  default

If the selected prerequisite is missing, VTDD must preserve an explicit
`requested` or `blocked` fallback state rather than pretending the no-manual
path completed.

The workflow must ignore its own marker comment so that reviewer reruns do not
create an infinite comment loop.

## Reviewer Input Boundary

Gemini receives:

- PR diff
- bounded PR context
- recent PR and review comments

Gemini does not receive:

- execution credentials
- merge authority
- deployment authority

## Reviewer Output Boundary

Gemini output must remain compatible with the existing reviewer contract:

- `critical_findings[]`
- `risks[]`
- `recommended_action`

For this slice, the canonical return surface is a PR comment carrying that
structured critique in a human-readable format.

## Upsert Rule

Gemini reruns must update the existing VTDD Gemini review comment when one is
already present.

The goal is to keep one current critical-review surface on the PR rather than
creating uncontrolled repeated comments.

When Gemini becomes available again after a fallback request, VTDD should
return to Gemini-first behavior and clear the stale Codex fallback request
state.

## Setup Boundary

This workflow is designed for public/per-user use:

- each user configures `GEMINI_API_KEY` in their own repository settings
- reviewer runtime remains user-owned
- the canonical repo does not embed owner-specific reviewer secrets
