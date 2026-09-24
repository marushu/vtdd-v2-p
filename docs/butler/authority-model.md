# Butler-Codex-Human Authority Model

This document is the canonical authority model for Issue #45.

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

VTDD must preserve a clear authority split:

- Codex is the executor
- Butler is the judgment and authority gateway
- Human is the final authority

This model exists so Codex can act with high freedom inside bounded Issue
scope without silently taking authority actions such as merge or issue close.

## Core Definition

- Issue is the canonical execution spec.
- GitHub runtime truth is the canonical current-state surface.
- Codex is free inside bounded Issue scope.
- Codex is not the spec authority.
- Codex does not merge or close issues directly.
- Butler performs authority-gated GitHub actions after human approval.
- Human remains the final authority for merge, close, deploy, permission, and
  credential decisions.

## Role Definitions

### Butler

Butler:

- reads Issue, PR, review comments, CI, and runtime truth
- decides whether execution may continue safely
- summarizes reviewer objections and unresolved risk
- requests human approval when authority boundaries are reached
- executes Butler-side GitHub authority actions through GitHub App after the
  required approval tier succeeds

Butler is the only role in this model that may bridge human approval into
GitHub authority actions.

### Codex

Codex:

- performs bounded coding work inside approved Issue scope
- creates and updates branches, commits, and PRs within that scope
- responds to review comments within approved scope
- may choose implementation details freely inside that scope

Codex must not:

- redefine spec
- silently widen Issue scope
- merge
- close issues
- perform Butler-side authority actions

### Human

Human:

- approves execution continuation when needed
- approves merge and issue close through Butler
- completes real passkey/WebAuthn approval for high-risk actions
- remains the final authority for milestone judgment

## Codex Default Path

The default Codex executor path is:

- Butler -> Mac PRIMARY; VPS STANDBY after scoped manual promotion

Codex Cloud GitHub integration remains an optional explicitly selected transport.

`OPENAI_API_KEY`-backed runners are optional opt-in machine paths, not the
default VTDD executor model.

## Authority Return Contract

Codex does not return to Butler through an invisible private chat channel.

Codex returns control through GitHub-observable runtime truth that Butler can
read. Canonical return surfaces are:

- PR state
- Issue comments
- PR comments
- review replies
- structured delegation/progress comments

When Codex reaches a boundary that requires Butler/human action, it must leave
GitHub-observable evidence that Butler can read and summarize.

## Canonical Return Markers

At minimum, the authority return contract recognizes these marker states:

- `approval_required`
- `scope_ambiguous`
- `review_response_needed`
- `blocked_by_missing_runtime_state`

Meaning:

- `approval_required`
  Codex has reached a boundary that requires Butler to obtain human approval
  before continuing.
- `scope_ambiguous`
  Codex cannot continue safely because Issue scope or bounded intent is not
  clear enough.
- `review_response_needed`
  reviewer objections or PR discussion require Butler/human judgment before the
  next bounded execution step.
- `blocked_by_missing_runtime_state`
  Codex cannot continue because required GitHub/runtime truth is missing,
  unreadable, or inconsistent.

## Merge And Close Authority

Merge and issue close are Butler-side authority actions.

Canonical path:

1. Codex creates or updates the PR
2. reviewer returns critique
3. Butler summarizes PR / review / CI state
4. human requests merge or close
5. Butler verifies approval tier
6. Butler uses GitHub App short-lived execution ability to perform the action

Codex does not perform merge directly.

## Approval Boundary

- read-only GitHub observation does not require merge authority
- normal bounded execution follows the normal execution approval tier
- merge and bounded issue close require explicit `GO + real passkey`
- deploy, credential mutation, permission mutation, and destructive actions
  require `GO + real passkey`

`passkey` in this model means real WebAuthn/passkey authentication, not a chat
phrase.

## Desktop Maintenance Required

If required operator-owned root credential bootstrap/update/repair work can only continue from
desktop bootstrap state, Butler must stop and surface:

- `desktop maintenance required`

This is not a Codex-side authority return marker. It is a Butler runtime state
that blocks further authority action until the desktop bootstrap path is used.
It should appear only for bootstrap/update/repair needs, not as a steady-state
requirement for normal iPhone-only operation.

## Non-goals

- replacing GitHub runtime truth with Codex summaries
- allowing Codex to merge directly
- making API-backed Codex runners the default path
- collapsing Butler and Codex into one authority role
