# VTDD Intent Mode Contract

Related Issues: #594, #455, #495, #595

## 現行 executor 契約 — Issue #858

Owner の明示承認により **Mac PRIMARY / VPS STANDBY / Butler authority** を採用する。
iPhone/iPad の Dashboard Butler が主操作面、Mac が通常の実行基盤、VPS は
emergency / break-glass と固定費内の recovery 用待機基盤である。
active-active、自動 failover、自動 failback は禁止する。heartbeat 喪失は owner action
だけを生成し、実行権を移さない。手動切替は現在の policy が指定する正の relatedIssue・from/to・generation に
束縛した real passkey 承認を必要とする。planned は freshな停止報告・clean/pushed/fresh checkpoint、emergency は
最終PRIMARY報告から10分以上とownerの電源/ネットワーク/アクセス隔離確認を必須とする。
transitionMode と隔離確認は passkey scope に束縛し、heartbeatから隔離を推測しない。
切替 API は durable control state だけを更新し、
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
reporter はサーバー generation を自動取得・採用しない。共有 bearer は transport 認証のみ。report/authorize は scoped passkey で
登録したノードごとの Ed25519 公開鍵で署名を検証し、nonce と時刻で replay を拒否する。
秘密鍵は端末の private ファイルだけに保持する。侵害済みノードの停止は保証しない。receipt の期限切れからの再承認/recovery は未接続で、fail closed を維持する。

Issue #860 のtransport分離は [executor transport契約](executor-transport-credential.md) を参照。
report/authorizeはnode専用 `Executor` token（D1にはdigestのみ）または従来global `Bearer`
を受け、両方で同じEd25519検証を必須とする。登録・更新は専用real passkey/CASのみ。
misumiと共有gateway credentialには触れない。live activationは別証拠である。

この隔離実装は control-state と実行前 admission fence を接続した slice である。
bridge の各turn/selector、VPS runner のqueue pickup/subprocess/GitHub write前にserverを照会する。
未初期化もbootstrap_requiredで拒否する。live設定・配置、installerのprovider-bound実行契約、
本番E2Eは未実施。進行中Codexの強制停止や認可と副作用の間の原子性は保証しない。
ローカル検証だけで運用全体の single-writer 完了を主張しない。

## Purpose

VTDD must exceed Custom GPT without turning into a rigid command runner.

The assistant is expected to notice risks, challenge weak ideas, propose better
paths, and say when work should stop. That autonomy is part of the product.
The same autonomy must not become unapproved scope expansion, heavy background
reasoning, external side effects, or premature completion claims.

This contract defines the mode boundary that Skills, subagents, Butler,
mac Codex, and VPS Codex CLI should share.

Dashboard Butler is the primary operator surface. Mac Codex is the PRIMARY
execution surface; VPS Codex CLI is the STANDBY emergency/recovery surface.
Butler retains authority; neither executor automatically takes over.

Therefore VTDD Skills must be repository-backed and usable by Dashboard Butler
and VPS Codex CLI. A Skill that only lives in a local mac Codex install is not a
product capability.

## Repository Sharing Gate

Do not say a Skill, contract, guardrail, or operating rule has been
`repo-backed`, `repository-backed`, `durable`, `共有済み`, or `リポジトリに入れた`
unless all applicable sharing steps are true:

- the change is in repository files, not only local mac Codex memory or
  `~/.codex`
- the changed files are committed on a topic branch
- the branch is pushed to the remote repository
- a Japanese-first PR is opened or updated with the change
- the PR body states whether Dashboard Butler / VPS Codex CLI can actually read
  or execute the behavior today
- if runtime discovery, Action Schema, VPS inventory, or E2E is missing, the PR
  marks the work `unconnected` or `incomplete`

If any step is missing, report the work as a draft, local probe, or
`mac_codex_only_probe`; do not present it as shared VTDD progress.

## Calm Git / PR Preflight

When the owner is frustrated, angry, or pointing out drift, do not rush into
more edits. The first action is to slow down and verify operational truth.

Before committing, pushing, opening a PR, updating a PR, or responding to review
comments, run or retrieve the equivalent of:

- current branch and upstream: `git status --short --branch`
- recent local commits: `git log --oneline --decorate -5`
- latest remote main: `git fetch origin main`
- base freshness: confirm `origin/main` is an ancestor of the topic branch or
  rebase/create a fresh branch before continuing
- PR state for any related branch: open / closed / merged, head SHA, base,
  merge commit, and review/check status
- reviewer / auto-merge truth: whether a reviewer approval, required check, or
  auto-merge path may already have merged the PR

If the related PR is merged, do not push follow-up work to that merged PR
branch. Create a new branch from latest `origin/main`, cherry-pick or reapply
only the intended follow-up, then open or update a separate Japanese-first PR.

After opening or updating a PR, the assistant remains responsible for checking
the PR state it just changed. At minimum, retrieve PR state, checks/reviews when
available, and whether the PR has already merged before making another branch or
push decision.

## Core Principle

AI autonomy is required for judgment, critique, and proposal.

AI autonomy is forbidden for unapproved scope expansion, external side effects,
and completion claims.

In owner-facing Japanese:

```text
判断・批評・提案は、AIが主体的にやる。
実行・外部効果・完了宣言は、Issue / GO / approval / evidence なしに進めない。
```

## Modes

### Read

Use Read mode when the owner asks for status, progress, PR readiness, Issue
readiness, close readiness, blockers, remaining work, queue position, or
runtime truth.

Read mode should:

- answer quickly with a compact first response
- use exact Issue / PR / runtime truth before broad reasoning
- produce a small status packet
- identify blockers and the next one action
- say whether a heavy check is required
- disclose when Codex CLI, reviewer, deploy, merge, or close was not triggered
- advise against unsafe or drift-prone next steps

Read mode must not:

- edit files
- launch runner / reviewer / deploy
- merge, close Issues, mutate credentials, or change permissions
- perform milestone completion judgment
- replace the active execution queue `Now`
- turn a status question into a broad planning detour

### Think

Use Think mode when the owner asks to shape an idea, design a path, compare
tradeoffs, decide whether to proceed, or identify what should be stopped.

Think mode should:

- challenge weak ideas plainly
- propose smaller Issue-backed paths
- identify Non-goals and authority boundaries
- classify work as `EMERGENCY`, `ROOT`, `NEXT`, `QUEUE`, `EVIDENCE`, or
  `QUESTION`
- propose RAG candidates for durable judgment
- keep the owner-facing language Japanese-first
- write Issue / PR titles, bodies, comments, review responses, and RAG
  candidates in Japanese by default unless the owner explicitly requests
  another language

Think mode must not:

- silently become Execute mode
- create broad implementation scope by implication
- call heavy tools solely to make the proposal feel more complete
- claim Butler Completion Gate success without route, authority, runtime truth,
  E2E evidence, and PR mapping

### Execute

Use Execute mode only when there is Issue-backed scope and the required authority
boundary is satisfied.

Execute mode should:

- state the risk-proportional bounded change contract before edits
- use current Mission / current Issue + direct dependencies as the default scope
- preserve execution queue truth without forcing a full queue read for unrelated scoped work
- keep one coherent bounded slice per PR where possible
- generate derived artifacts before final tests/CI when required
- validate scoped tests first, then run the full suite once on the coherent state
- report incomplete or Butler-unconnected surfaces honestly

Execute mode must not:

- deploy, mutate credentials, mutate permissions, or perform destructive work
  without scoped passkey approval
- merge, close Issues, or delete merged branches without explicit scoped `GO`
- downscope active Issues by omission
- mix unrelated refactors or "while here" edits into the slice

## Status Packet

Read-mode status and readiness answers should converge on this packet shape:

```text
対象:
状態:
関連Issue/PR:
未解決blocker:
最新runtime event:
次の一手:
heavy_check_required: yes / no / unknown
cost_boundary:
checkedAt:
source pointers:
```

`cost_boundary` should say whether the answer used lightweight read only or
whether Codex CLI / reviewer / deploy / runner work is required next.

## Skill Boundary

Repo-backed Skills should implement the mode boundary, not replace it.

Skills belong in the repository or another declared shared source that Butler
and VPS Codex CLI can read. Do not treat a local mac Codex Skill as the canonical
implementation. If mac Codex drafts a Skill first, the next step is to promote
the behavior into repository docs / `.agents/skills` / runtime truth so
Dashboard Butler can own the workflow, then commit, push, and open or update the
PR before claiming the behavior is repository-backed.

The first read-only Skill is `vtdd-status-advisor`:

- mode: Read
- role: read truth, classify state, surface blockers, advise next action, stop
  before execution
- authority: readonly
- completion: never enough by itself for Butler Completion Gate

The central traffic-control Skill is `vtdd-chief-butler`:

- mode: Read / Think / Execute boundary keeper
- role: preserve Issue traceability, execution queue state, authority boundary,
  repository sharing, RAG candidate discipline, and Butler-first completion
- authority: no authority by itself; execution still requires Issue scope, GO,
  passkey approval, or an explicit forbidden result
- completion: never enough by itself for Butler Completion Gate

`vtdd-chief-butler` is a core VTDD operating surface, not a personal mac Codex
convenience. If it exists only under `~/.codex/skills`, that is a defect and a
ROOT-class `butler_gap_found` / `vps_handoff_gap_found` until the behavior is
repository-backed and connected to Dashboard Butler / VPS Codex CLI discovery.

Local skills under `~/.codex/skills` are useful bootstrap aids, but they are not
VTDD completion unless Butler and VPS Codex CLI can read equivalent repo-backed
instructions or runtime truth. A mac-only Skill improvement must be reported as
`mac_codex_only_probe` or `butler_gap_found`.

When a future implementation connects Skill discovery to runtime, Dashboard
Butler should expose the owner-facing intent and VPS Codex CLI should execute or
observe the repo-backed Skill behavior. mac Codex should not remain the only
surface that knows the rule.

## Custom GPT Baseline

Dashboard Butler must not become a worse normal chat surface than Custom GPT.
For current VTDD implementation work, Dashboard Butler is the primary owner
surface. Custom GPT remains a fallback surface and setup-compatibility concern;
it is not the default implementation target unless the owner explicitly scopes a
Custom GPT fallback change.

VTDD should exceed Custom GPT by keeping natural conversation while adding:

- Issue / PR / Actions / runtime truth
- execution queue awareness
- approval and passkey boundaries
- VPS handoff and progress visibility
- recoverability from iPhone/iPad
- evidence-backed completion claims

If governance makes ordinary conversation slower, noisier, or less helpful than
Custom GPT, the design is failing and should be treated as a product blocker.

## Public/Core Boundary

This contract does not depend on owner-specific runtime URLs, accounts, or
credentials. It must remain usable by other repository owners.

The historical setup-wizard line is not reactivated by this contract.

## Completion Boundary

Adding this contract or the first Skill does not complete #594, #455, #495, or
#595 by itself. Completion still requires runtime connection, Action Schema or
equivalent Butler reachability, authority boundaries, runtime truth, and mapped
E2E evidence.
