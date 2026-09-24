# VTDD-managed Remote Codex CLI Executor

This document is the canonical remote-executor transport contract under parent
Issue #4.

Historical note:
- Issue `#6` captured the first execution-spine slice for this transport
- current implementation authority for the full Butler-Codex-Gemini loop lives
  under Issue `#4`
- Issue `#6` remains useful as historical execution-transport context, not as a
  competing parent contract

## 現行 executor 契約 — Issue #858

Owner の明示承認により **Mac PRIMARY / VPS STANDBY / Butler authority** を採用する。
iPhone/iPad の Dashboard Butler が主操作面、Mac が通常の実行基盤、VPS は
emergency / break-glass と固定費内の recovery 用待機基盤である。
active-active、自動 failover、自動 failback は禁止する。heartbeat 喪失は owner action
だけを生成し、実行権を移さない。手動切替は現在の policy が指定する正の relatedIssue・from/to・generation に
束縛した real passkey 承認を必要とする。切替 API は durable control state だけを更新し、
merge/deploy/root/credential 権限やプロセス操作を含まない。

VPS は Mac で app-server smoke 検証済みかつ owner 承認済みの exact Codex version だけに追従する。
Mac の bundled Codex 自動更新は PRIMARY の健康性を壊さず、versionApprovalPending と
未承認 candidate を表示する。承認済み版は standby sync の目標で、自動変更しない。
latest の推測、npm 自動更新は禁止。初期化も専用 passkey を必要とし、初回 report
から PRIMARY を推測しない。未初期化は Dashboard にそのまま表示する。
古い generation の復帰ノードは実行可能と扱わない。

transition は control-state 更新だけで activationPending=true。対象・旧新 generation・
relatedIssue・10分の期限を束縛した receipt を、対象側 helper がサーバーと照合して private
config に明示適用する。対象の新世代/receipt付き fresh heartbeat・running・smoke・承認済み版一致まで
「切替準備中」と表示する。
reporter はサーバー generation を自動取得・採用しない。共有 bearer のためノード本人性の
暗号学的証明はなく、偶発的な旧世代プロセス対策である。adversarial split-brain 防止とは
主張しない。receipt の期限切れからの再承認/recovery は未接続で、fail closed を維持する。

この隔離実装は control-state と実行前 admission fence を接続した slice である。
bridge の各turn/selector、VPS runner のqueue pickup/subprocess/GitHub write前にserverを照会する。
未初期化もbootstrap_requiredで拒否する。live設定・配置、installerのprovider-bound実行契約、
本番E2Eは未実施。進行中Codexの強制停止や認可と副作用の間の原子性は保証しない。
ローカル検証だけで運用全体の single-writer 完了を主張しない。

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

## Optional Codex Cloud GitHub Comment Runner

The optional no-extra-API-cost comment transport is:

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
- after posting a bounded `vps_runner` queue comment, Dashboard Butler may send
  a best-effort wakeup request to the connected Dashboard app-server bridge so
  the user-owned VPS can run `systemctl --user start vtdd-vps-runner.service`
  immediately instead of waiting for the next timer tick
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
push changes, and open a ready PR for reviewer/automation. It is intentionally an operator-owned script,
not a hosted VTDD service.

Privileged host maintenance for this runner is a separate authority plane.
When root/sudo work is required, such as systemd service recovery, Playwright
Chromium dependency installation, or Codex sandbox sysctl repair, the normal
VTDD path must be the Issue #637 capability lifecycle documented in
[vps-privileged-maintenance-capability-lifecycle.md](./vps-privileged-maintenance-capability-lifecycle.md):
Dashboard Butler asks for scoped passkey approval, a root-owned helper executes
an allowlisted capability, PWA notification is used when owner action is
required, and redacted runtime truth is returned. Mac SSH/root work remains
break-glass bootstrap evidence, not Butler-complete recovery.

If the owner's Mac is unavailable and the VPS runner needs emergency authority
that is broader than an existing Issue #637 capability, the boundary is Issue
#843 and the security contract is
[VPS Emergency Access Boundary](../security/vps-emergency-access-boundary.md).
That path is still not broad standing sudo: it requires a visible owner scope,
short TTL, volatile secret exposure, cleanup, and audit.

For privileged maintenance pickup, the same user-owned runner entrypoint also
recognizes a distinct GitHub Issue comment marker:

- `<!-- vtdd:vps-privileged-maintenance-execution:<executionId> -->`
- JSON payload `transport` must be `vps_privileged_maintenance_helper`
- payload must include the canonical repository, Issue number,
  `approvalScopeMatched=true`, `issueTraceability.issueTraceable=true`, and
  the `executionEnvelope` returned by
  `vtddCreateVpsMaintenanceHelperExecution`
- the runner accepts only the bounded helper invocation
  `sudo -n /usr/local/sbin/vtdd-vps-maintenance-helper --execute --input <helper-execution-input-json>`
  with `shell:false`
- the runner writes `helperExecutionInput` to a temporary local file with
  restricted permissions, invokes the root-owned helper, removes the file, and
  reports redacted runtime truth through normal
  `<!-- vtdd:vps-runner-event:<executionId> -->` comments

This marker is not a Codex implementation queue and must not be used for
branch/PR creation. It is only for scoped, passkey-approved Issue #637 helper
execution handoff.

Ready PR means reviewer and automation can inspect the handoff result. It is
not an Issue-completion claim and it is not merge authority. Merge remains
behind reviewer approval, required checks, head-SHA consistency, mergeability,
the configured auto-merge policy, or a governed approval path.

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

### Immediate Wakeup and Timer Fallback

Immediate wakeup is the primary pickup path. Operators should keep
`vtdd-vps-runner.timer` enabled only as a recovery fallback so a missed wakeup,
temporary service start failure, or already-local pending queue item does not
strand queued work.

When Dashboard Butler has a live app-server bridge for the same dashboard
thread, the Worker can send a bounded `runner_wakeup_requested` message after a
`vps_runner` queue comment is successfully posted. The bridge is allowed to run
only this fixed non-root command:

```sh
systemctl --user start vtdd-vps-runner.service
```

The wakeup request does not carry arbitrary shell, command arguments, sudo,
root-owned helper input, deploy authority, merge authority, or credential
mutation authority. It is the normal pickup trigger, not an authority grant. If
it succeeds, runtime truth must show `fallbackUsed=false`. If it fails after the
queue is already local or GitHub-queued, the response must keep the queue state
as `queued` and report `fallbackUsed=true`, `fallbackRole=recovery_only`, and
`fallback=vtdd-vps-runner.timer`.

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

## Issue #858 のローカル実装と operator 引継ぎ

- `GET /v2/executors/overview` は Dashboard 認証、`POST /v2/executors/report`
  は machine bearer 認証。初回 Mac report は bounded bootstrapCandidate として保存するが
  初期化しない。first report だけで PRIMARY は存在しない。
- 初期化画面は同一 origin の
  `/v2/approval/passkey/operator?mode=failover-bootstrap&executorFrom=vps&executorGeneration=0&issueNumber=<current-related-issue>`。
  from=vps は初期割当の scope 識別子。画面は server candidate の版と smoke/時刻を表示し、
  ファイル upload や JSON 入力を要求しない。exact version・relatedIssue・from/to・generation
  を real passkey で承認する。候補の版が変わる/古くなる場合、初期化は再承認が必要。
- 正常な PRIMARY が running なら owner action は不要。計画切替は **quiesce → report →
  scope確認 → passkey → control transition → 対象lease適用 → heartbeat** の順。
  quiesce は担当 runner の既存承認境界で新規仕事を止め、進行中の仕事を終えて clean/pushed
  checkpoint と inactive/stopped report を生成する工程。ここで汎用 kill API は追加しない。
  Butler からの計画 quiesce の自動 dispatch は未接続であり、この工程を完了済みと扱わない。
- PRIMARY heartbeat が stale の緊急切替は owner の明示 passkey が必須。heartbeat 喪失だけ
  で実プロセス停止を証明できないため、運用時には旧ノードの隔離/fencing 確認も必要。
  transition は control-state 更新のみ。既存runnerの実行前admission fenceはコード接続済みだが、
  進行中Codexの強制停止やlive配備済みの保証はない。
- transition は generation を一回増やし activationPending=true にする。応答の bounded
  leaseReceipt は対象ノードに私的に渡し、`apply-executor-lease.mjs --config <private-json>
  --receipt <private-json>` で適用する。対象・旧世代・期限をローカル確認し、machine-auth
  `/v2/executors/activation/verify` に完全一致を照会してから config を atomic overwrite。
  reporter と同じ lock を取るため、適用前に reporter の正常終了が必要。
- reporter は overview を読んで generation を更新しない。leaseReceiptId 付きの新世代
  heartbeat/running/smoke/版一致が届くまで PRIMARY healthy とは表示しない。10分の activation
  receipt 期限切れは再承認 recovery 未接続として停止する。自動 revert/failback はない。

Reporter は `node scripts/report-executor-node.mjs --config <absolute-private-json> --once`。
config は mode 0600 とし、executorId、generation、codexCommand、origin、lockPath を指定する。
秘密値は config に入れず `VTDD_GATEWAY_BEARER_TOKEN` または既存 vault helper から取得。
optional `VTDD_VAULT_MANIFEST_PATH` は private manifest を指定する。token は出力しない。
outputPath は同じ directory の private temporary file と rename で継続的に原子更新する。
既存 lock を PID の有無や時刻で削除しない。自分の inode の lock だけを終了時に解除する。

checkpointPath は現在の仕事を担当する executor が書いた mode 0600 の bounded checkpoint。
repository/branch/headSha/current issueNumber を含む。会話やコマンド本文を入れない。
無指定/ファイル未生成時は repoPath/repository/baseRef の固定 git read を fallback とする。
不正な checkpoint は fallback で隠さず失敗。現在の Issue が不明なら issueNumber=null。
元の updatedAt を書き換えない。dirty/unpushed は切替を強く阻止する。

`node scripts/smoke-executor-app-server.mjs --config <private-json>` は configured codexCommand
で固定 `--version` と ephemeral `app-server` を shell=false で起動し、initialize と initialized
だけを送る。thread/start/resume/turn は送らない。終了対象は自分が spawn した子プロセスだけ。
結果は smokeEvidencePath に private atomic write。通常 Mac service の起動は不要。
reporter はこの証拠を読み、版一致と120秒の鮮度を検証する。report/証拠の時計ずれは未来側
120秒まで許容し、server receivedAt でも鮮度を制限する。配置/scheduling は live 未実施。

`plan-codex-version-sync.mjs` は Mac/VPS report/control overview JSON から exact plan を生成。
`sync-codex-exact-version.mjs --request <file> --check` は `packageName=@openai/codex` と
exact semver、正の issueNumber を検証するだけ。`--apply` は必ず blocked。JSON verified:true
は real grant の代替ではない。installer/rollback/sudo は実行しない。Macの候補版はhomeの「Macの検証済み版を承認」から明示的に承認する。
`POST /v2/executors/version` は executor_failover_version / destructive のreal passkeyを
Issue/current generation/from-to Mac/previous version/exact candidateへ束縛する。
CASの再評価で現在のMac fresh smoke報告を照合し、approvedCodexVersionだけを変更する。
package installやpromotion権限を含まない。

### Mac PWA bridge activation の未接続境界

実行基盤カードだけでは PWA → Mac Codex の疎通完了ではない。
`run-dashboard-app-server-bridge.mjs` の既存起動契約は VTDD_RUNTIME_URL、
VTDD_GATEWAY_BEARER_TOKEN（private environment、引数にsecretを書かない）、
VTDD_DASHBOARD_THREAD_ID、VTDD_DASHBOARD_CODEX_CWD、
VTDD_DASHBOARD_BRIDGE_HEARTBEAT_FILE（private absolute path）。Node の WebSocket 対応と
承認した Codex binary が解決される PATH を確認する。新しい公開URL/個人パスを固定しない。
bridge の既定 repo-sync preflight は git/network に触れるため、この隔離検証では実行しない。
launchd の generic installer/plist、live executor config/lease運用設定、live起動、
iPhone→Mac会話happy/failure E2E は **次の live activation gap / 未実装・未検証**。
この coding turn では launchd/service/credential/runtime profile を変更しない。

Synthetic home E2E は `node scripts/e2e-issue858-executor-home.mjs`。
390×844 light/dark × 正常・staleで昇格可能・版不一致・dirty・activation pending・未初期化
の12ケース。全 request を intercept し、本番・既存 browser profile に接続しない。
成果物は `.local/issue-858/browser`。sandbox が Chromium 起動を拒否する環境では未検証と
して引き継ぎ、制限を迂回しない。monitor/notification/shared navigation も同時に確認する。

### Review #2 — 実行 admission fence

共通 private reporter config を `VTDD_EXECUTOR_CONFIG_PATH`（絶対パス、0600）で
bridge/runner に指定する。代替は明示的 `VTDD_EXECUTOR_ID` / `VTDD_EXECUTOR_GENERATION`。
サーバーgenerationを読む・自動採用する経路はない。runtime側は各認可時にこのローカル
configを読み直す。lease helperの明示更新後は対象だけが新世代になり、旧ノードは旧世代のまま。
endpoint originはconfig.originまたはVTDD_RUNTIME_URL、transport tokenは既存環境から渡す。
追加vault読取やcredentials変更はこのfenceにはない。

`POST /v2/executors/authorize` は machine-auth、入力は executorId/generation/purpose
(dashboard_turn / vps_queue / vps_work) のみ。返却は allowed/reason のみで世代を配布しない。
control state未初期化はbootstrap_requiredで拒否。初回reportとowner passkey初期化を先に行う。
通信失敗・設定不足・非PRIMARY・旧世代・activationPending・unhealthyも拒否する。
共有gateway tokenだけのoverview読取は拒否し、home aggregateでもexecutor詳細を返さない。

bridgeは認可済み起動時のみrepo sync/app-server initializeを行い、未承認時はidle transport
を維持する。各owner turnのselector（Codex起動を含む）前とhandler前、model fallback前にも
再認可する。拒否はowner-facing executor_fenced。VPS runnerはpreflight/queue claimより前、
仕事dispatch、subprocess、GitHub write前に再認可する。standbyでは仕事を開始しない。

これはチェック時点のadmission fenceであって、進行中turn/subprocessのremote killや
全副作用をserver generationと一つのtransactionにする機構ではない。直前認可後の切替競合、
ローカルで直接起動した別経路、shared bearerによるID偽装は別の境界。planned切替はまず
PRIMARY quiesceとclean/pushed checkpointを必要とし、runningをreadyとは表示しない。
smoke/report/leaseがコード上存在しても、live Mac/VPSサービス接続・本番PWAの成功は未主張。
