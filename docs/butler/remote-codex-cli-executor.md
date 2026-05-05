# VTDD-managed Remote Codex CLI Executor

This document is the canonical remote-executor transport contract under parent
Issue #4.

Historical note:
- Issue `#6` captured the first execution-spine slice for this transport
- current implementation authority for the full Butler-Codex-Gemini loop lives
  under Issue `#4`
- Issue `#6` remains useful as historical execution-transport context, not as a
  competing parent contract

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

Executor transport is a pluggable registry. The VTDD public/core repository is
not a shared hosted runner, and `marushu/vtdd-v2-p` must not be presented as an
execution backend for other users. Each user brings their own GitHub,
Cloudflare, ChatGPT/Codex, reviewer, and executor backend assets.

Target repository and executor backend are separate:

- target repository: the repository being changed, such as TOMIO, SunabaEye, or
  `vtdd-v2-p`
- executor backend: the user-owned comment integration, private control
  repository, trusted VPS, or explicit API-key runner that performs the work

The registered executor transports are:

| Transport | Owner / credential boundary | Billing / cost boundary | Success evidence |
| --- | --- | --- | --- |
| `codex_cloud_github_comment` | Operator-owned ChatGPT/Codex GitHub integration | ChatGPT/Codex subscription path; no `OPENAI_API_KEY` | Request is not success; branch and/or PR evidence must appear on GitHub |
| `codex_cloud_cli_control_runner` | User-owned private control repository or trusted runner with ChatGPT-managed Codex auth | User-owned runner cost such as private GitHub Actions minutes; no `OPENAI_API_KEY` | workflow run plus GitHub-visible branch / PR evidence |
| `vps_runner` | User-owned trusted VPS / persistent host | User pays and maintains VPS; VTDD core does not host it | runner log plus GitHub-visible branch / PR evidence |
| `api_key_runner` | User-owned control repository or trusted runner with `OPENAI_API_KEY` | Explicit opt-in OpenAI API billing, separate from ChatGPT/Codex subscription | workflow run plus GitHub-visible branch / PR evidence |

The `api_key_runner` transport is an optional `api_key_runner`, not a default
account model.

The owner-specific `vtdd-v2-secret` private repository is owner evidence and an
example of the `codex_cloud_cli_control_runner` shape. It is not a shared
runner for other VTDD users.

Codex Cloud comment delegation remains request-state until GitHub-visible
runtime truth appears. Queued/requested/comment-only evidence is not
implementation success.

## Default Codex Cloud GitHub Comment Runner

The default no-extra-API-cost runner is:

- Butler builds a bounded execution contract from Issue and GitHub runtime truth
- VTDD posts that contract as a GitHub comment containing `@codex`
- Codex Cloud, running under the operator's ChatGPT/Codex account, picks up the task
- Codex creates or updates a PR
- Butler tracks progress from the delegation comment, branch, and PR state

This runner does not use `OPENAI_API_KEY`.

If Codex Cloud does not create a GitHub-visible branch or PR after the pickup
grace period, Butler must not keep reporting the handoff as merely queued
forever. It must report a first-class blocked state such as
`codex_cloud_pickup_not_observed`, preserving the delegation comment URL and
the absence of branch/PR evidence as runtime truth.

## Codex Cloud CLI Control Runner

The confirmed no-`OPENAI_API_KEY` machine path is
`codex_cloud_cli_control_runner`:

- Butler dispatches a bounded request to a user-owned private control
  repository or trusted runner.
- That backend restores ChatGPT-managed Codex authentication for `codex cloud
  exec`.
- The backend operates on the target repository and opens or updates a branch /
  PR there.
- Butler tracks the GitHub Actions workflow run, target branch, and PR as
  runtime truth.

The live evidence recorded for Issue #157 used this account model and produced
GitHub-visible PR evidence. The evidence repository name `vtdd-v2-secret` is an
owner-specific example, not shared infrastructure.

Because a private control repository consumes account-wide private GitHub
Actions minutes, Butler-facing guidance must surface cost and queueing state.
When repeated TOMIO / SunabaEye / other target repository work makes private
Actions minutes or repository constraints a poor fit, move the user's backend
to `vps_runner` rather than silently changing to API billing.

## User-owned VPS Runner

`vps_runner` is the planned trusted-host alternative for users who want to avoid
or reduce private GitHub Actions runner cost. It is not a prerequisite for VTDD
core, and VTDD core does not provide or operate the VPS. The user is responsible
for host security, patching, credentials, logging, and availability.

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
- which target branch or PR proves GitHub-visible Codex work started?

Progress must be reconstructable from:

- GitHub Actions run state
- VTDD execution log
- branch / PR state in GitHub runtime truth

For `codex_cloud_cli_control_runner`, the top-level progress `status` and
`branch` describe the control workflow run for compatibility with existing
consumers. Implementation success is reported separately under
`targetRuntimeTruth`, which is derived from the bounded target repository and
branch. A completed control workflow is not success by itself. If the workflow
completes without a target branch or PR, `targetRuntimeTruth.status` must be
`blocked` with the workflow conclusion and the missing runtime evidence rather
than reporting implementation completion.

Target runtime truth requires both the bounded target repository and target
branch inputs, plus GitHub App read access to the target repository's PR and
branch surfaces. If those inputs or permissions are missing, Butler must report
the progress as blocked/unverified for implementation success rather than
falling back to the control workflow conclusion.

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
