# Issue #637: low-risk recovery read を passkey なしで helper queue に渡す

## 完了体験

Dashboard Butler で owner が「VPS runner の状態を見て」「app-server bridge が落ちてないか確認して」と聞いた時、低リスクの status / logs / read は passkey 承認待ちで止まらず、bounded helper queue として VPS runner へ渡る。owner は「承認してください」ではなく「確認依頼を渡した。完了 truth を待つ」と読める。

restart、enable、add、root-required capability、credential / permission / destructive work は引き続き scoped passkey approval で止まる。

## VTDD 全体で進める部分

Issue #637 の Butler-first recovery plane を進める。最新 Issue コメントで定義された Lane B では、低リスク status/read は approval なしで読める必要がある。これにより、VPS / bridge / runner が怪しい時の最初の診断で owner が毎回 passkey を開く負担を減らす。

## 設計

Dashboard 自然文 VPS maintenance flow で proposal を作った後、capability が `riskLevel=low` かつ `operation=review` かつ registry 上 `requiresRoot=false` なら、passkey approval を要求せず内部 read grant として helper request を生成し、既存の helper execution queue path へ流す。

内部 read grant は passkey grant ではないため、ID と runtime truth に `approvalBypassReason=low_risk_read` を明示する。root/helper 実行は queue handoff 時点では開始しない。

## 仮説

現 runtime は `systemd_user_runner_status` や `systemd_user_app_server_bridge_status` のような低リスク read でも `approval_required` にしている。Issue #637 の最新方針とはズレており、VPS が怪しい時の初動診断を重くしている。

low-risk review に限って既存 queue path へ直接進めれば、権限境界を崩さずに recovery plane の使い勝手を改善できる。

## 検証計画

- Unit: Dashboard chat の `VPS runner status` が `queued_for_vps_helper_execution` になり、approval URL を出さない。
- Unit: DashboardChatRoom WebSocket 経由でも低リスク status が app-server bridge へ流れず Worker helper queue に入る。
- Unit: repo-less bridge restart は `approval_required` のまま残る。
- Unit: high risk Playwright add は `approval_required` のまま残る。
- `npm run build:worker`
- `npm run check:generated-worker`
- focused worker tests

## 改修見積もり

- `src/worker/runtime.js`: Dashboard VPS maintenance natural-language flow に low-risk read bypass 判定と helper request 生成を追加する。
- `test/worker.test.js`: 既存 #637 tests の期待値を更新し、restart/high-risk approval 境界の regression を追加する。
- `worker.js`: generated Worker bundle。

## 既に通っている経路

proposal 作成、approval proposal 保存、passkey approval 後 helper request 作成、helper execution envelope、GitHub Issue queue comment、VPS runner pickup は既に存在する。

## 未確認の境界

production VPS runner が low-risk read queue を拾って実行完了 truth を Dashboard に返す live evidence は merge/deploy 後に必要。

## 穴が出そうな箇所

- low-risk 判定が甘いと restart / add / root-required まで approval なしになる。
- passkey grant と内部 read grant を同じものとして扱うと監査が曖昧になる。
- helper request validator が approvalGrantId を必須としているため、read grant の ID 形状を明示しないと後続が壊れる。

## PR 前に確認すること

open PR がないこと、Issue #637 が open であること、#590 evidence を兼ねるため長めの turn で進行ログが残ること。

## 実装候補と捨てた案

採用: low-risk review + non-root registry capability のみ internal read grant で queue 化する。

捨てた案: low-risk status を Worker 内で直接実行する。Worker は VPS host command を実行できず、Butler-first runtime truth を失う。

捨てた案: すべて passkey のままにする。Issue #637 の latest recovery plane 方針とズレ、初動診断が重い。

## merge 後に通す E2E

production Dashboard Butler で「VPS runner の状態を確認して。Issue #637」を送り、passkey なしで helper queue に渡ること、VPS runner completed event が Dashboard thread に戻ること、#590 の `進行ログ` が最終返信に残ることを確認する。

## 次の PR を増やさない理由

この PR は low-risk read の authority boundary だけを変える。restart / sync / root-required / capability lifecycle mutation を混ぜると passkey 境界が広がるため別 PR にする。

## 停止条件

restart / enable / add / high risk / root-required capability が approval なしで進む、または helper queue が passkey grant と read grant を区別できない場合は停止する。
