# Issue #637 repo-less 低リスク read/status repository 解決

## 完了体験

Owner が Dashboard Butler の repo-less main chat で「Issue #637 E2E: VPS runner の status を確認して。repository は marushu/vtdd-v2-p。低リスク read/status として、passkey なしで helper queue に渡るか確認して。」と自然文で送る。Dashboard Worker は本文中の `owner/repo` を repository context として解決し、`systemd_user_runner_status` を `operation=review` / `riskLevel=low` / `requiresRoot=false` として判定し、passkey approval なしで bounded helper queue comment を作る。runtime truth は `approvalRequired=false` / `approvalBypassReason=low_risk_read` / `helperQueueReached=true` / `rootExecutionStarted=false` / `helperExecutionStarted=false` を返す。

## VTDD 全体で進める部分

Issue #637 の privileged maintenance lifecycle のうち、低リスク read/status の repo-less main chat 接続だけを進める。root helper 実行、restart、sync、credential、permission、deploy、Issue close は今回の対象外。

## 設計

現在の HTTP route は body の `repository` がある場合に queue 化できる。一方、repo-less PWA WebSocket では `repository` context が未指定のまま `resolveDashboardChatRepository` に入り、本文中の `repository は marushu/vtdd-v2-p` を拾えず `missingContext:["repository"]` の pass-through になる。

修正は repository 解決の抽出器に限定する。文頭 `owner/repo` だけではなく、`repository は owner/repo`、`repo: owner/repo`、本文中の単独 `owner/repo` を canonical repository token として拾う。alias 推測や default repository は追加しない。

## 仮説

失敗原因は `extractRepositoryTokenFromDashboardChatText` が文頭 canonical token しか拾わないこと。今回の production E2E 文面では canonical token が本文中にあるため、repo-less thread の Worker preflight が repository 未解決として app-server bridge へ pass-through した。

この仮説が正しければ、抽出器を本文中 canonical token 対応にすると、DashboardChatRoom WebSocket path でも `buildVpsMaintenanceIntentMessages` が Worker 内で queue 化し、app-server bridge へ送られない。

## 検証計画

- Unit: `extractRepositoryTokenFromDashboardChatText` を経由する WebSocket owner message で、本文中 `repository は marushu/vtdd-v2-p` が queue 化されることを `test/worker.test.js` で確認する。
- Authority: queue comment body に `approvalBypassReason=low_risk_read` が含まれ、approval URL が出ないことを確認する。
- Safety: root/helper 実行開始は Worker では起きず、`rootExecutionStarted=false` / `helperExecutionStarted=false` を確認する。
- Worker bundle: `npm run verify:worker` を実行し、generated `worker.js` を更新する。
- Production E2E: merge/deploy 後、同じ #637 prompt で 30秒以内に helper queue comment が作られ、runner pickup が passkey なしで進むことを確認する。

## 改修見積もり

- `src/worker/runtime.js`: `extractRepositoryTokenFromDashboardChatText`。本文中 canonical repository token の抽出を追加する。リスクは通常会話中の URL やコード断片を repository と誤認すること。`normalizeCanonicalRepositoryInput` の owner/repo 形式に限定して抑える。
- `test/worker.test.js`: repo-less WebSocket + #637 low-risk read/status の回帰テストを追加する。リスクは既存 pass-through テストとの期待値衝突。既存 missing-context テストは repository が本文にないケースとして維持する。
- `worker.js`: worker bundle 生成物。`src/worker/runtime.js` 変更に伴い更新する。

## 既に通っている経路

- HTTP `/v2/dashboard/chat/messages` に `repository` body がある場合、低リスク runner status は helper queue に到達する。
- `docs/butler/vps-privileged-maintenance-capability-lifecycle.md` は低リスク read/status の passkey bypass 条件を定義済み。
- VPS runner は `vtdd:vps-privileged-maintenance-execution` queue comment を pickup して helper へ渡せる。

## 未確認の境界

- production PWA の form dataset が repo-less main chat で空であることは turn context から推定しているが、今回の修正は dataset に依存しない。
- owner text に複数 `owner/repo` が含まれる場合の優先順位は最初の canonical token とする。複数候補確認 UI は今回追加しない。

## 穴が出そうな箇所

- GitHub URL `https://github.com/owner/repo/...` 内の `owner/repo` を拾う可能性がある。これは repository 指定として実用上許容できるが、PR URL 等から repo が拾われるため、意図しない repo 切替には注意する。
- `repository は` の日本語表現以外も拾うため、自然文中のコード例に owner/repo がある場合は repository context になる。デフォルト repo よりは安全だが、複数候補処理は未実装。

## PR 前に確認すること

- `git status --short --branch`
- `npm run verify:worker`
- 追加テストが既存 pass-through behavior を壊していないこと
- PR body に #637 E2E 失敗コメントとこの strategy file を参照すること

## 実装候補と捨てた案

採用: repository token 抽出器を狭く拡張する。

捨てた案: repo-less main chat に default repository を持たせる。Issue #613 の repo-less cross-repo 方針と衝突するため不採用。

捨てた案: app-server bridge に判断させて helper queue comment を書かせる。Butler は中継機であり、低リスク read/status の authority 判定と queue handoff は Worker runtime truth として扱うべきなので不採用。

## merge 後に通す E2E

production deploy 後、Dashboard Butler repo-less main chat から同じ #637 prompt を送る。期待値は app-server bridge へ流れず Worker が butler message を返し、#637 に helper queue comment が作られ、VPS runner event が passkey なしで completed になること。#590 evidence として、進行中表示がリアルタイムに出るかは別途観察する。

## 次の PR を増やさない理由

この slice は #637 の production E2E failure の直接原因である repository 解決だけを修正する。root helper lifecycle や realtime progress は別 Issue / 別 slice であり、混ぜると authority と evidence が曖昧になる。

## 停止条件

repository token 抽出だけで queue 化できない場合、原因は repository 解決ではなく WebSocket path の Worker flow / memory provider / GitHub queue 作成にあるため、追加実装へ広げず停止して再設計する。高リスク操作が passkey なしで queue 化される兆候が出た場合も停止する。
