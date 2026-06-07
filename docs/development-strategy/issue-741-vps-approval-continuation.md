# Issue #741 VPS approval continuation follow-up 作戦図

## 完了体験

Owner が VPS runner admin の passkey operator で承認したあと、operator page は Dashboard Butler に戻す continuation POST を行い、Worker は `approvalGrantId` と `vpsProposalId` を根拠に VPS helper queue handoff を継続する。失敗する場合も `unknown` ではなく、Dashboard Butler と operator response の両方に blocked reason / runtime truth が残る。

## VTDD 全体で進める部分

Issue #741 の bridge 自律復旧検証に入る前に、承認後 continuation が普通の chat message として吸い込まれる blocker を直す。これは VPS 実機の systemd 変更ではなく、Worker runtime の approval continuation routing 修正である。

## 設計

- `vpsProposalId` と `approvalGrantId` がある Dashboard chat POST は、本文の自然文検出に依存せず VPS privileged maintenance flow として扱う。
- `blocked` になった VPS maintenance flow でも、レスポンスの `execution` を落とさず operator に原因を返す。
- 通常の owner chat は従来通り自然文 intent 検出がある時だけ Worker-side VPS maintenance flow に入る。
- 高リスク実行そのものは開始しない。helper queue handoff までの routing と error visibility だけを直す。

## 仮説

画像の `VPS helper queue handoff did not queue. unknown` は、operator page の continuation POST が HTTP 202 を受けたものの、Worker response の `execution` が `null` だったため発生した。`buildDashboardChatTurn` は text intent を検出した時だけ `buildDashboardVpsPrivilegedMaintenanceNaturalLanguageFlow` を呼び、さらに `blocked` status の flow を response から落とす。承認済み continuation payload 自体を authoritative intent として扱えば、この unknown は消え、真の blocker が operator に出る。

## 検証計画

- Unit: passkey operator continuation text が弱くても `vpsProposalId` / `approvalGrantId` がある場合は `queued_for_vps_helper_execution` へ進む。
- Unit: helper request が blocked の場合でも response に `execution.status=blocked` と runtime truth が残る。
- Existing: `test/worker.test.js` の VPS maintenance / Dashboard chat 関連回帰を通す。
- Full: `npm test` は PR 前に通す。
- Live: merge 後、VPS で operator approval continuation を再実行し、queue comment 作成または明示的 blocked reason を確認する。

## 改修見積もり

- `src/worker/runtime.js`
  - `buildDashboardChatTurn`: approval continuation payload を natural-language intent と同等に扱う。risk は通常 chat の過検出だが、`approvalGrantId` と `vpsProposalId` の両方を要求して限定する。
  - `shouldDashboardVpsMaintenanceFlowStayInWorker`: `blocked` も response に残す。risk は owner chat に blocked Butler message が出ることだが、VPS maintenance intent の場合は必要な runtime truth である。
- `test/worker.test.js`
  - continuation routing と blocked visibility の regression tests を追加する。

## 既に通っている経路

- `/v2/vps/privileged-maintenance/proposals` は proposal と approval operator URL を作成できた。
- passkey operator は承認自体を完了し、continuation POST まで到達した。
- Dashboard chat store には continuation owner message が保存された。

## 未確認の境界

- live VPS の privileged helper sudoers は未確認/不可であり、queue 後の root helper 実行まではこの PR で完了 claim しない。
- 今回の修正後も live systemd timer install / enable は別途 passkey approval と runtime evidence が必要である。

## 穴が出そうな箇所

- `approvalGrantId` を含む payload が普通の chat として扱われると、今回と同じ unknown になる。
- `blocked` execution を response から落とすと operator では原因が見えない。
- continuation auth と turn build の条件がずれると、認可だけ通って実行 flow が消える。

## PR 前に確認すること

- #824 は merged なので、この branch から新規 PR にする。
- PR body では #741 partial follow-up と明記し、VPS timer install / live E2E は未完了として残す。
- owner-specific URL や secret は code / docs に追加しない。

## 実装候補と捨てた案

- 採用: `vpsProposalId + approvalGrantId` を continuation intent として明示判定する。
- 採用: blocked flow も response execution に残して operator が reason を表示できるようにする。
- 捨てた案: operator 固定文言だけを検出語に追加する。文言変更で再発するため弱い。
- 捨てた案: mac Codex から SSH で直接 restart して終わらせる。Butler completion gate と承認後 continuation の実バグを残す。

## merge 後に通す E2E

- passkey operator URL を再発行し、承認後に `queued_for_vps_helper_execution` または明示的 `blocked` reason が表示されること。
- queue が作成された場合、VPS runner/helper pickup の runtime truth を確認する。
- bridge restart 後に heartbeat `pong_received` と PID match を確認する。
- watchdog timer install / enable は別途 scoped approval 後に確認する。

## 次の PR を増やさない理由

今回の blocker は approval continuation routing と error visibility の同一原因であり、分割すると operator `unknown` が残ったままになる。systemd timer install や live self-heal test は外部副作用なので、この PR には混ぜない。

## 停止条件

- continuation approval scope validation が壊れている場合は、routing 修正だけで進めず scope validation の blocker を報告する。
- GitHub App queue comment 作成権限が欠けている場合は、明示的 blocked reason を返すところまでをこの PR の完了にする。
- live VPS systemd 変更は passkey approval なしでは実行しない。
