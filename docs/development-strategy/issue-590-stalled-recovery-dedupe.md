# Issue #590: stalled recovery message dedupe

## 完了体験

Dashboard Butler が app-server / VPS Codex CLI の応答確認中になっても、同じ thread に同じ SYSTEM stalled 文言を何度も積み上げない。owner は「会話が壊れた」のではなく「同じ入力と文脈を保持したまま再接続確認中」と短く分かり、同じ thread で補足やキャンセル指示を続けられる。

この PR の完了は Issue #590 の完了ではない。Issue #590 は、実 Codex progress の逐次表示、production slow-turn E2E、stop / interrupt / owner input queue の整理が残る。

## VTDD 全体で進める部分

Issue #590 の root blocker のうち、production PWA で確認された「stalled recovery 表示が owner-facing progress の代わりに重複 SYSTEM として残る」問題だけを直す。mac Codex へ戻らずに Butler thread で復旧・補足できる体験の土台を整える。

## 設計

初回の `app_server_turn_failed` / timeout は、これまで通り recovery evidence として SYSTEM message に保存する。これは「入力は保存済みで同じ thread で続けられる」ことを thread history に残すため。

同じ thread の直近に同一 `role=system` / `status=stalled` / text の message がある場合、2回目以降は永続 message として保存しない。代わりに transient status だけを更新する。transient status は全文ではなく短い文言にし、下部 status area が長文で埋まらないようにする。

## 仮説

`DashboardChatRoom.acceptAppServerBridgeMessage()` は `normalizeDashboardAppServerBridgeEvent()` が返した `messages` を無条件に `appendMany()` している。そのため bridge 側が quiet / stalled retry を繰り返すと、同じ stalled SYSTEM message が thread に何度も保存される。

`normalizeDashboardAppServerBridgeEvent()` は `app_server_turn_failed` の `transientText` に failure thread text 全文を入れているため、persistent bubble と bottom transient の両方に同じ長文が出る。スクショの「なんら改善されていない」感はこの二重化と重複保存で説明できる。

## 検証計画

- Worker unit test で同じ `app_server_turn_failed` timeout event を2回送る。
- 1回目は SYSTEM stalled message として保存されることを確認する。
- 2回目は thread message が増えないことを確認する。
- 2回目でも transient status は送られ、短い再接続中文言になることを確認する。
- 既存の「初回 timeout は recovery message として保存する」test は維持する。
- `npm run build:worker` と `npm run check:generated-worker` で generated worker の同期を確認する。

## 改修見積もり

- `src/worker/runtime.js`
  - `acceptAppServerBridgeMessage()` で app-server bridge 由来の messages を append 前に重複除外する。
  - `normalizeDashboardAppServerBridgeEvent()` / helper で stalled transient text を短くする。
  - risk: 初回 recovery message まで消すと owner が復旧状態を履歴で追えなくなる。
- `test/worker.test.js`
  - stalled event dedupe と short transient status の regression test を追加する。
  - risk: 実時刻や messageId に依存すると flaky になるため、text/status/role で検証する。
- `worker.js`
  - runtime bundle 生成物。`npm run build:worker` で更新する。

## 既に通っている経路

PR #721 / PR #727 で固定 2分 timeout の扱いは緩和された。PR #728 で slow-turn E2E harness は入った。これらは「長時間 turn を観測できる土台」だが、今回のスクショに出ている重複 SYSTEM 表示はまだ残っている。

## 未確認の境界

本番の app-server bridge がどの間隔で stalled event を再送しているかは未確認。ただし重複保存を worker 側で止めれば、bridge 側再送間隔に依存せず thread 汚染は止められる。

## 穴が出そうな箇所

- 異なる failed text まで dedupe すると別原因の failure が見えなくなる。
- first stalled message を transient-only にすると recovery evidence が消える。
- bottom transient に全文を残すと、SYSTEM dedupe しても owner 体感は改善しない。

## PR 前に確認すること

Issue #590、PR #728 merged truth、active execution queue、既存 worker tests、generated worker 差分を確認する。deploy はこの PR では実行しない。

## 実装候補と捨てた案

- 採用: worker append 前の recent-message dedupe と short transient status。
- 捨てた案: bridge 側だけで stalled event を止める。WebSocket reconnect や duplicate delivery に弱いため。
- 捨てた案: stalled message を一切保存しない。owner が後から thread history で recovery state を確認できなくなるため。

## merge 後に通す E2E

production Dashboard Butler で slow-turn / stalled recovery を発火し、同じ SYSTEM stalled 文言が2個以上増えないこと、下部 status が短く、同じ thread で補足を送れることを確認する。

## 次の PR を増やさない理由

この PR は screenshot で確認できた具体的 UX regression に限定する。実 Codex progress の逐次表示、deploy status 自動投稿、stop / interrupt UI は別 Issue/PR slice に分けないと今回の root symptom がぼやける。

## 停止条件

first recovery message が保存されなくなる、通常 app-server reply が保存されなくなる、異なる failure が隠れる、owner-specific runtime URL を埋め込む、deploy / credential / permission / root 操作が必要になる場合は停止する。
