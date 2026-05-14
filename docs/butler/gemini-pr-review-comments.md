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

- VTDD appends a timestamped `vtdd:reviewer=codex-fallback` request comment that
  targets the user-owned VPS Codex CLI reviewer transport
- the default request path does not use `OPENAI_API_KEY`
- the request remains request-state until the VPS reviewer runner returns a completed fallback
  reviewer marker with a recommended action

When Gemini is temporarily unavailable, a completed
`vtdd:reviewer=codex-fallback` marker comment with a recommended action is
valid fallback reviewer evidence only when it is written by a trusted
VTDD-controlled actor or by an explicitly configured Codex Cloud reviewer result path. Butler must
not treat the absence of GitHub Review API objects alone as absence of reviewer
evidence, but it must not trust spoofable marker comments from untrusted
authors.

Current limitation:

- a VTDD bot-authored `@codex review` request proves only that fallback was
  requested when the legacy Codex Cloud comment path is selected; it is not completed reviewer evidence by itself
- a `chatgpt-codex-connector` response that asks the operator to create/connect
  a Codex account is a fallback blocker (`codex_connector_not_configured`), not
  reviewer progress
- if the selected Codex reviewer transport does not pick up the request, VTDD must keep the fallback state
  as requested or blocked rather than pretending review completed

## Operator Prerequisite

For the default non-manual Codex fallback to reach a `completed` reviewer
state, the user-owned VPS runner must be configured with an authenticated Codex
CLI session and allowed repository policy. This avoids depending on the
ChatGPT/Codex GitHub connector for the default path.

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

## GitHub Actor Boundary

Gemini reviewer writeback must use the role-specific `VTDD Gemini Reviewer`
GitHub App token. The Actions secrets are:

- `VTDD_GEMINI_REVIEWER_APP_ID`
- `VTDD_GEMINI_REVIEWER_APP_PRIVATE_KEY`

The legacy shared `VTDD_GITHUB_APP_ID` / `VTDD_GITHUB_APP_PRIVATE_KEY` token
must not be used for Gemini reviewer comments because it makes the GitHub
timeline ambiguous about which VTDD role wrote the comment.

## Reviewer Output Boundary

Gemini output must remain compatible with the existing reviewer contract:

- `critical_findings[]`
- `risks[]`
- `recommended_action`

For this slice, the canonical return surface is a PR comment carrying that
structured critique in a human-readable format.

## Append Timeline Rule

Gemini reruns must append a new timestamped VTDD Gemini reviewer marker comment.
Existing reviewer evidence must not be overwritten.

The goal is to preserve a GitHub-visible reviewer timeline. Butler, mac Codex,
and VPS Codex CLI must read the latest trusted marker for the relevant PR head
SHA instead of assuming there is only one current reviewer comment.

Butler summaries must present the current `Recommended action` and the Gemini
marker comment URL from the latest trusted reviewer marker. Older marker
comments remain historical evidence, not the current reviewer judgment.

Append does not mean uncontrolled repetition. Reviewer marker comments must not
self-trigger review loops, and an `approve` marker for the same PR head SHA is a
terminal state unless a new commit, explicit trusted re-review request, or later
blocking reviewer signal reopens review.

The VTDD reviewer marker comment is the canonical VTDD reviewer signal for
Butler synthesis. It must not be confused with GitHub formal Pull Request
Review API objects or GitHub `reviewDecision` state. If a marker recommends
`approve` but no GitHub formal approval exists, Butler may report the marker
as reviewer evidence, but must not say the GitHub review decision is approved.

GitHub formal review objects remain separate runtime truth. A formal
`CHANGES_REQUESTED` / `changes_requested` state is blocking even when the VTDD
reviewer marker recommends `approve`, and Butler must route the PR back to
bounded revision instead of merge judgment.

When Gemini becomes available again after a fallback request, VTDD should return
to Gemini-first behavior by appending fresh Gemini reviewer evidence. Stale
Codex fallback request comments remain historical evidence; Butler should treat
the latest trusted marker for the relevant head SHA as current.

## Objection Resolution Re-Check

For the iPhone-only `revise_pr` loop, a VPS/Codex revision may be followed by a
GitHub-visible objection-resolution comment from the VTDD bot:

`<!-- vtdd:reviewer-objection-resolution -->`

That marker is allowed to trigger a Gemini re-check even when the comment author
is a bot. Gemini's own `vtdd:reviewer=gemini` marker remains loop-protected and
must not self-trigger a review.

This rule is based on live Issue #206 / PR #207 evidence: the VPS runner added
the requested `revision-applied marker`, but Gemini skipped the bot-authored
resolution marker as `bot_or_marker_comment`. A Mac-authored follow-up comment
was then required to move Gemini to `approve`, which failed the iPhone-only
completion baseline. The resolution marker must therefore be treated as trusted
review context, not as a generic marker comment.

## Setup Boundary

This workflow is designed for public/per-user use:

- each user configures `GEMINI_API_KEY` in their own repository settings
- reviewer runtime remains user-owned
- the canonical repo does not embed owner-specific reviewer secrets
