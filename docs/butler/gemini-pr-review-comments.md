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
may upsert a GitHub-visible Codex fallback review request comment (`@codex
review`) instead of hard-failing the PR solely for reviewer availability
reasons.

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
