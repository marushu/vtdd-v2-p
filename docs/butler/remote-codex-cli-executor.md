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

`vps_runner` is the trusted-host alternative for users who want to avoid or
reduce private GitHub Actions runner cost. It is not a prerequisite for VTDD
core, and VTDD core does not provide or operate the VPS. The user is
responsible for host security, patching, credentials, logging, and
availability.

The public/core dispatch contract for `vps_runner` is GitHub-backed and does
not require a public inbound VPS API:

- Butler / Worker posts a bounded queue comment on the target Issue with
  `<!-- vtdd:vps-runner-execution:<executionId> -->`
- the user-owned VPS runner polls GitHub and picks up only allowlisted,
  issue-traceable queue comments
- the VPS runner reports milestone events back as Issue comments with
  `<!-- vtdd:vps-runner-event:<executionId> -->`
- for post-merge verification, Butler uses the same queue with
  `codexGoal=post_merge_verify`; the VPS runner does not start Codex or create
  a branch/PR, and instead verifies merged PR truth, VPS `main` sync, runner
  timer/service state, and pending work snapshot
- while long-running Codex CLI or `gh` commands are active, the VPS runner
  updates one runner state comment with
  `<!-- vtdd:vps-runner-state:<executionId> -->`; the state comment also keeps
  the existing runner event marker for compatibility and carries
  `currentStep`, `heartbeatAt`, `updatedAt`, command name, exit code when
  known, and a short redacted stderr summary
- Butler reads the queue comment, runner state/event comments, target branch,
  and target PR as GitHub runtime truth
- queued/requested is not implementation success; if no runner pickup or
  branch/PR evidence appears after the grace period, progress becomes blocked
  with `vps_runner_pickup_not_observed`

### Private Repository Actions-Minimization Mode

For private repositories, the preferred low-Actions-consumption
shape is:

- use `vps_runner` for Codex implementation, branch push, and PR creation
- keep GitHub Actions only for bounded PR gates that still need to run on
  GitHub, such as required tests, guarded PR-body policy, and reviewer
  writeback
- do not use `remote-codex-executor.yml` for normal private-repository Codex
  implementation work once the trusted VPS runner is configured
- do not silently switch to `api_key_runner` as a workaround for private
  Actions minutes

This means VPS migration reduces the Actions minutes spent on Codex execution,
fresh checkout, Node setup, Codex install/auth, and PR creation inside a
GitHub-hosted runner. It does not eliminate Actions minutes for workflows that
remain GitHub-hosted by design, including PR checks, Gemini review, deploy
dispatches, or any repository-specific CI configured on the target repository.

For a private-branch target repository, configure the repository policy with
the private base branch explicitly:

```json
{
  "repositories": {
    "owner/private-repo": {
      "enabled": true,
      "baseRefs": ["private"],
      "branchPrefixes": ["codex/"]
    }
  }
}
```

Butler-facing guidance must describe this as "Codex implementation moved off
GitHub-hosted Actions" rather than "Actions cost is zero." If a private
repository still runs PR checks or reviewer workflows on GitHub-hosted runners,
those minutes remain visible GitHub Actions usage.

The public/core repository includes a minimal user-owned runner entrypoint at
`scripts/run-vps-runner.mjs`. It can poll the GitHub queue contract, report
runner events, create the target branch, run Codex CLI in a cloned workspace,
push changes, and open a draft PR. It is intentionally an operator-owned script,
not a hosted VTDD service.

Required runner environment:

- `GITHUB_TOKEN` or `GH_TOKEN`: token available to `gh`, GitHub API reads,
  branch push, Issue comment write, and PR creation for the allowlisted target
  repositories.
- `VTDD_VPS_RUNNER_REPOSITORIES`: comma-separated allowlist such as
  `owner/repo,owner/another-repo`. This is the simple default form.
- Optional `VTDD_VPS_RUNNER_CONFIG`: path to a JSON allowlist file. When set,
  it replaces `VTDD_VPS_RUNNER_REPOSITORIES` and allows per-repository policy:

  ```json
  {
    "repositories": {
      "marushu/vtdd-v2-p": {
        "enabled": true,
        "baseRefs": ["main"],
        "branchPrefixes": ["codex/"]
      },
      "owner/private-repo": {
        "enabled": true,
        "baseRefs": ["private"],
        "branchPrefixes": ["codex/"]
      }
    }
  }
  ```

  The runner ignores queue comments whose repository is not allowlisted, whose
  `baseRef` is not in that repository's `baseRefs`, or whose branch does not
  start with one of that repository's `branchPrefixes`.
- Optional `scripts/vtdd-runner-repo.mjs`: operator helper for maintaining the
  JSON allowlist. Butler owns nickname resolution; this helper accepts only the
  resolved canonical `owner/repo` so the VPS does not duplicate nickname memory.
  `add` and `check` verify GitHub runtime truth through `gh repo view`, including
  current visibility and default branch, but visibility is not persisted as
  policy because repositories may move between private and public:

  ```bash
  node scripts/vtdd-runner-repo.mjs add owner/private-repo --base private --branch-prefix codex/
  node scripts/vtdd-runner-repo.mjs check owner/private-repo
  node scripts/vtdd-runner-repo.mjs list
  ```

  The normal Butler path should remain natural-language first: Butler resolves
  a nickname such as `TOMIO` to a canonical repository, the Worker writes a
  bounded VPS runner queue request for that repository, and the VPS runner
  executes only if the resolved repository is allowlisted.
- Optional `VTDD_VPS_RUNNER_WORKDIR`: workspace root. Defaults to
  `~/vtdd-runner/workspaces`.
- Codex CLI must be authenticated on the VPS user account. If `codex exec`
  returns 401 or missing authentication, the runner reports
  `codex_auth_unavailable` back through the VPS runner event comment.
- Optional `VTDD_VPS_RUNNER_CODEX_SANDBOX`: Codex sandbox mode. Defaults to
  `workspace-write`.
- Optional `VTDD_VPS_RUNNER_CODEX_SANDBOX_BYPASS=true`: uses Codex
  `--dangerously-bypass-approvals-and-sandbox`. This is only for a trusted,
  user-owned runner when the host cannot run Codex's bubblewrap sandbox, and it
  must not be enabled in shared or untrusted infrastructure.
- Optional `VTDD_VPS_RUNNER_HEARTBEAT_SECONDS`: interval for GitHub-visible
  runner state updates while Codex CLI or `gh` subprocesses are running.
  Defaults to `120`. Set to `0` only when heartbeat updates are intentionally
  disabled.

Dry-run pickup check:

```sh
node scripts/run-vps-runner.mjs --dry-run
```

One-shot execution:

```sh
node scripts/run-vps-runner.mjs
```

Cancel / drain control:

- Butler requests cancel or drain through `vtddVpsRunnerCancel`, which writes a
  `<!-- vtdd:vps-runner-canceled:<executionId> -->` marker onto the existing
  queue comment. The queue comment is not deleted.
- `mode=execution` cancels the named executionId. If the execution is already
  running, this is a cooperative cancel request; the runner stops at the next
  safe checkpoint and reports a canceled event.
- `mode=issue_pending` cancels pending queue comments for the named Issue only.
  Running executions are not killed by this mode.
- `mode=drain_pending` cancels all pending queue comments in the allowlisted
  repository scan. Running executions are not killed by this mode.
- The runner must ignore any queue comment with a canceled marker before pickup
  and must check the queue comment for a canceled marker at safe checkpoints
  during execution. It must not delete pushed branches, commits, PRs, or
  comments as part of cancellation.

The script is suitable for a later systemd timer/service wrapper, but systemd
installation, Codex login, token placement, and credential storage remain
user-owned runtime setup. They must not be represented as shared VTDD
infrastructure or embedded in this public/core repository.

## Optional API-backed Runner

The optional machine-runner implementation path is GitHub Actions centered.

- Butler triggers a VTDD-managed workflow dispatch
- the workflow runs Codex CLI remotely
- the workflow operates on the target repository and branch
- progress is observed through GitHub Actions run state plus VTDD execution logs
- the workflow accepts `codex_actor` so GitHub-visible writes can be attributed
  to `vtdd-codex`, `mac-codex`, or `vps-codex-cli`

This path must remain explicit opt-in because it depends on `OPENAI_API_KEY`.
Do not present it as the only VTDD remote executor path.

The `codex_actor` secret mapping is defined in
`docs/security/github-app-actor-identity.md`. The default remains
`vtdd-codex` for compatibility. Selecting `mac-codex` or `vps-codex-cli`
requires the corresponding role-specific GitHub App secrets to be configured.

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
- VPS runner GitHub queue and event comments when using `vps_runner`

For `vps_runner`, the preflight receipt must also include a `handoffNote`
readable by Butler, mac Codex, and VPS Codex CLI. This note is restart context,
not a substitute for GitHub runtime truth. It records the current surface, target
repository, Issue, branch/base ref, Codex goal, the next safe action, the
blocked-return route, and the expectation that important decisions or failed
hypotheses should be offered as RAG checkpoint candidates before handoff ends.
If the note and GitHub runtime truth conflict, Butler must follow runtime truth
and surface the mismatch rather than guessing.

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

For `vps_runner`, progress is derived from the GitHub queue comment, runner
state/event comments, and target branch / PR evidence. The latest runner state
or event may include `currentStep`, `heartbeatAt`, `updatedAt`, and a bounded
command diagnostic. A runner event comment may report raw failure, but it is not
completion evidence unless GitHub-visible branch or PR truth exists. If a
queue comment carries a canceled marker, Butler must surface `status=canceled`,
the cancellation payload, and a `vps_runner_execution_canceled` blocker from
GitHub-visible runtime truth. If a running execution is canceled, the runner
reports a cooperative canceled event at the next safe checkpoint; it does not
perform unrestricted process kill or cleanup already-pushed GitHub state. If a
runner reports failure and no target PR exists, Butler must surface the raw
failure as blocked. If the latest running event is older than the stale
threshold, Butler must surface `vps_runner_event_stale` with the last step and
age instead of treating an existing pushed branch as healthy progress forever.
Runner state/event payloads also carry concise lead-time telemetry under
`leadTime`: `queued_at`, `picked_up_at`, `codex_started_at`,
`branch_pushed_at`, `pr_created_at`, `completed_at`, `failed_at`, and derived
durations for queue wait, Codex execution, PR creation, and total lead time.
The same values are rendered as short GitHub-visible lines such as
`Queue wait: 12s` and `Codex execution: 3m 42s`.

When the VPS runner reports `status: completed`, the same GitHub-visible event
must also carry an explicit terminal outcome in `finalEvent` and `lastEvent`.
Valid terminal outcomes include `pr_created`, `pr_updated`,
`post_merge_verification_completed`,
`conflict_resolved`, `blocked`, `failed`, `no_changes`, and
`merge_retry_ready`. Butler must use that terminal outcome, not the bare word
`completed`, when explaining whether the runner created a PR, updated a PR,
verified post-merge runtime truth, resolved a conflict, made no changes, or
stopped with a visible blocker.

Runner event comments may include a GitHub mention only as a notification
mirror; the JSON event payload and branch / PR evidence remain the runtime
truth. The mention target is selected in this priority order when a login is
available and not a bot or notification-blocked actor: queue comment author,
Issue author, PR author, approval / GO actor, then no mention. Mentions are
limited to milestone events (`picked_up`, `branch_pushed`, `pr_created`,
`pr_updated`, `conflict_resolved`, `no_changes`, `merge_retry_ready`,
`blocked`, `failed`, `stale`, `deploy_required`, `completed`). Heartbeat and
progress-poll comments must not mention anyone.

For explicit VPS runner health checks, Butler uses `vtddVpsRunnerStatus`. The
status check is read-only and is derived from the same GitHub queue comment,
runner state/event comments, branch, and PR truth as `vtddExecutionProgress`. It
returns a short `health` summary with `runnerStatus`, `runnerAlive`,
`lastSeenAt`, `heartbeatAt`, queue pickup state, `leadTime`, `currentStep`, and
a safe `reasonCode` / `reason` when the runner is stale, canceled,
unavailable, or not yet picked up. This endpoint does not SSH into the VPS,
stream logs, mutate credentials, deploy, merge, close Issues, or administer the
runner.

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
