# Issue #637 VPS operator URL completeness strategy

## 完了体験

Owner が Dashboard Butler に「bridge を再起動して」「VPS runner を確認して」のように自然文で依頼した時、Butler は proposal 生成済みの passkey operator URL を返す。Owner は URL を開いて passkey 承認だけを行う。承認後は operator page が同じ Dashboard chat thread に戻り、`approvalGrantId` を owner にコピーさせず、VPS helper queue へ自動継続する。

## VTDD 全体で進める部分

Issue #637 の owner-facing approval path を進める。低リスク read/status は既に passkey なしで queue 通過 evidence がある。今回は restart など passkey が必要な flow で、operator URL が自動継続に必要な context を必ず持つことに絞る。

## 設計

Dashboard Butler natural-language flow は proposal 作成時に `dashboardThreadId` を渡しているが、owner 入力に `executionId` が無い場合は operator URL に `executionId` が入らない可能性がある。`executionId` は承認後の helper queue comment / runner event / Dashboard delivery を同じ作業として追跡するために必要なので、Dashboard natural-language flow 側で必ず生成する。

approval-required reply では、owner action を「この URL で passkey 承認だけ」と明示し、`vpsProposalId` や `approvalGrantId` を owner に手入力させない境界を見える化する。

## 仮説

原因は `buildDashboardVpsPrivilegedMaintenanceNaturalLanguageFlow()` が `payload.executionId` をそのまま proposal 作成へ渡していること。自然文 chat では通常 `executionId` が無いため、URL completeness が caller 依存になる。ここを runtime 側で生成すれば、Butler は常に proposal-backed URL を出せる。

## 検証計画

- Unit: #637 Dashboard restart intent の test で operator URL に `mode=vps`、`vpsProposalId`、`dashboardThreadId`、`executionId` が揃うことを確認する。
- Unit: approval-required reply が owner に passkey 承認だけを求め、manual copy を求めないことを確認する。
- Integration: `npm run build:worker` と `npm run check:generated-worker`。
- Hygiene: `git diff --check`。

## 改修見積もり

- `src/worker/runtime.js`: Dashboard VPS natural-language proposal path で fallback `executionId` を生成し、approval-required reply に owner action を追加する。
- `test/worker.test.js`: #637 restart intent test の URL completeness / owner action assertion を追加する。
- `worker.js`: generated worker bundle 更新。

## 既に通っている経路

Issue #637 は repo-less low-risk read/status helper queue の production E2E が通過済み。`vpsProposalId` と `dashboardThreadId` を持つ operator URL と auto-continue route の基本テストも存在する。

## 未確認の境界

production Dashboard chat で passkey 承認後に restart helper queue が実際に pickup / completion することは、この PR では実行しない。passkey approval と restart execution は merge/deploy 後の owner approval 境界で確認する。

## 穴が出そうな箇所

executionId を毎回不安定にすると retry / duplicate queue の追跡が難しくなる。既存 helper request と同じ `createDashboardRequestId()` を使い、operator URL と execution body に同じ値を通す。

## PR 前に確認すること

Issue #637、passkey auto-continue strategy、operator page source、Dashboard natural-language flow、既存 #637 tests、current `origin/main` を確認する。

## 実装候補と捨てた案

採用案は Dashboard natural-language flow 内で executionId を必ず生成する。捨てた案は owner に URL パラメータを追加入力させること、汎用 passkey URL を出すこと、operator page 側で proposal なしに補完すること。いずれも owner が passkey 承認だけで済む完成形に反する。

## merge 後に通す E2E

production Dashboard Butler で restart 系 intent を送り、proposal-backed operator URL を開いて passkey 承認する。期待値は同じ Dashboard thread への auto-continue、helper queue comment 作成、runner pickup / completion truth の返却。

## 次の PR を増やさない理由

この PR は URL completeness と owner action 文言の同一 approval surface に閉じる。restart 実行 evidence は authority boundary 上 merge/deploy 後にしか得られないため、この PR で予測できる実装不足を残さない。

## 停止条件

URL に proposal context が揃わない、approvalGrantId copy/manual flow が必要になる、または Worker から root/helper execution を直接始める必要が出た場合は停止する。
