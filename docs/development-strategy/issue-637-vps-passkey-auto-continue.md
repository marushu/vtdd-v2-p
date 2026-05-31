# Issue #637 VPS passkey auto-continue strategy

## 完了体験

Owner は Dashboard Butler のチャットで VPS runner status などの自然文 intent を送る。Butler が同じ chat thread に passkey 認証リンクを出し、owner は passkey ボタンを押すだけでよい。承認後、operator page は approvalGrantId を owner にコピーさせず、同じ Dashboard Butler thread に承認イベントを返し、VPS helper queue へ自動継続する。

## VTDD 全体で進める部分

Issue #637 のうち、自然文 Dashboard Butler intent から passkey 承認を経て helper queue に戻る owner-facing 接続を進める。root-owned helper 実行、capability manifest、runner pickup、結果通知の既存経路は今回の変更対象ではなく、承認イベントが chat thread へ戻るかを固定する。

## 設計

Dashboard Butler が proposal を作る時点で `dashboardThreadId` と `executionId` を approval operator URL に埋め込む。passkey operator page は `mode=vps` かつ `dashboardThreadId` がある場合に auto-continue mode とし、承認成功後に same-origin の `/v2/dashboard/chat/messages` へ `approvalGrantId` と `vpsProposalId` を送る。Dashboard chat route は既存の #637 自然文 flow を使い、helper request、execution envelope、GitHub queue comment まで進める。

## 仮説

現状の詰まりは helper queue そのものではなく、passkey 認証後の `approvalGrantId` が Dashboard Butler の thread に戻らず、owner が JSON をコピーする手作業に落ちていること。承認イベントを同じ thread に戻せば、owner は passkey だけを押し、Butler が queue 継続と通知確認を担当できる。

## 検証計画

Worker unit/integration test で、Dashboard Butler の approval URL に `dashboardThreadId` と `executionId` が入ること、operator page が VPS auto-continue mode で copy UI を隠し、承認後に `/v2/dashboard/chat/messages` へ戻す JS を持つことを確認する。`npm run verify:worker` で generated worker と self parity を確認する。merge/deploy 後に production Dashboard Butler live E2E で、owner passkey 後に helper queue が作られることを確認する。

## 改修見積もり

- `src/worker/runtime.js`: `createVpsPrivilegedMaintenanceProposal`、`buildVpsMaintenanceApprovalOperatorUrl`、`handlePasskeyOperatorPageRequest`、`buildDashboardVpsPrivilegedMaintenanceNaturalLanguageFlow`。
- `src/core/passkey-operator-page.js`: VPS scope、auto-continue mode、承認後 callback、manual copy UI 表示条件。
- `test/worker.test.js`: Dashboard Butler approval URL、operator page auto-continue、copy UI suppression の assertions。
- `worker.js`: generated worker。

## 既に通っている経路

Dashboard Butler natural-language intent、proposal 作成、scoped passkey approval、helper request 作成、execution envelope 作成、GitHub issue queue comment、VPS runner pickup/result comment は既存 PR 群で部分的に通っている。

## 未確認の境界

Production deploy 後の live Dashboard session cookie / auth state、PWA notification の受信表示、VPS runner pickup の実 production timing は PR 前ローカル検証だけでは完了扱いにしない。

## 穴が出そうな箇所

operator page が `dashboardThreadId` を持たない URL では従来の manual approvalGrantId flow を残す必要がある。Dashboard auth が切れている場合は auto-continue POST が `dashboard_auth_required` で止まる。helper queue への handoff は root/helper execution そのものではなく、rootExecutionStarted=false / helperExecutionStarted=false の境界を守る。

## PR 前に確認すること

Issue #637 の Success Criteria、AGENTS.md の Butler Completion Gate、execution queue contract、active queue、差分が #637 に収まること、worker generated file が更新されていること、`npm run verify:worker` が通ること。

## 実装候補と捨てた案

採用案は passkey operator page から same-origin Dashboard chat API へ承認イベントを戻す。捨てた案は approvalGrantId の copy/paste、通知だけで owner に次操作を促す案、mac Codex が JSON を拾って代理実行する案。どれも Butler completion ではない。

## merge 後に通す E2E

Production deploy 後、Dashboard Butler で #637 VPS runner status 自然文 prompt を送る。表示された passkey URL を owner が承認し、operator page が同じ Dashboard thread に戻して helper queue 作成まで進むことを確認する。結果は Dashboard Butler thread、通知センター、Issue #637 queue/result comment の三点で確認する。

## 次の PR を増やさない理由

今回の変更は既存 helper queue 実装に合わせ、欠けていた passkey event return だけを接続する。新しい queue protocol や notification subsystem を増やさず、既存 `/v2/dashboard/chat/messages` と #637 natural-language flow を再利用するため、この slice から予測できる別 PR を増やさない。

## 停止条件

Dashboard chat API が approvalGrantId を受けても helper queue に進めない場合、approval scope が proposal と一致しない場合、Dashboard auth が passkey 承認後に復帰できない場合、または root/helper execution を operator page から直接始める必要が出た場合は停止する。
