# Issue #741 bridge resume state

## 完了体験

deploy 後または app-server bridge restart 後、owner は同じ Dashboard chat で「bridge が再接続した」「既存 Codex thread を resume した」「turn id が確定した」「進行中または完了した」を確認できる。

owner は前の文脈を再入力せず、repo-less main chat の同じ thread で続きから会話できる。

## VTDD 全体で進める部分

この PR は Issue #741 の最初の runtime state slice である。systemd restart policy や deploy 後 checkout sync そのものではなく、restart / reconnect 後に Dashboard が復帰状態を観測できる event contract を先に作る。

## 設計

- bridge WebSocket open 時に `app_server_status` を送信し、thread id と lifecycle status を Dashboard に出す。
- request に `codexThreadId` がある場合、`thread/resume` 成功後に `resumed_existing_thread` status を送信する。
- request に `codexThreadId` がない場合は従来どおり `thread/start` status を送信する。
- `turn/start` 成功後に turn id / message id / resume state を含む `turn_started` status を送信する。
- status は transient owner-facing runtime truth として扱い、chat history に durable spam を増やさない。

## 仮説

Worker 側には `app_server_thread:<dashboardThreadId>` mapping と pending owner message drain が既にある。bridge 側も `codexThreadId` を受け取ると `thread/resume` できる。

不足しているのは、deploy 後 restart や bridge reconnect 時に「何が復元されたか」を owner が見える runtime truth として出すこと。これがないため、裏では復帰していても Butler では止まったように見える。

## 検証計画

- `test/dashboard-app-server-bridge.test.js` に bridge open status、resume status、turn started status の assertion を追加する。
- existing fresh turn test で `thread/start` は維持されることを確認する。
- existing resume request test で `thread/resume` が使われることを確認する。
- `node --test test/dashboard-app-server-bridge.test.js` を通す。
- `git diff --check` を通す。

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`
  - bridge connected status helper を追加する。
  - `handleDashboardTurnRequest()` の resume/start/turn-start status を拡張する。
  - `connectDashboardAppServerBridgeOnce()` の WebSocket open 時に lifecycle status を送る。
- `test/dashboard-app-server-bridge.test.js`
  - open/reconnect status、resume status、turn started status のテストを追加または更新する。

## 既に通っている経路

- Worker Durable Object は `app_server_thread:<dashboardThreadId>` に Codex thread id を保存している。
- Worker は app-server bridge reconnect 時に pending owner messages を drain できる。
- bridge は `codexThreadId` がある request で `thread/resume` を呼ぶ。
- bridge は `turn/started` / progress / reply / timeout を Dashboard event に変換できる。

## 未確認の境界

- systemd unit の `RuntimeMaxSec=` / watchdog 設定は未確認。
- deploy 後 checkout sync + restart helper は未実装。
- production VPS での before/after CPU/memory evidence は未取得。
- Codex app-server が restart 中 turn をどこまで resume できるかは provider behavior に依存する。

## 穴が出そうな箇所

- bridge が restart した瞬間に進行中 Codex turn の notification stream を完全に再購読できるとは限らない。
- pending owner message は Worker 側で保持できるが、turn 中の partial progress は Dashboard event と chat state にどこまで保持するか後続設計が必要。
- transient status だけでは sleep 復帰後の過去 state を見返せないため、後続で runtime state store が必要になる可能性がある。

## PR 前に確認すること

- Issue #741 の Success Criteria と Non-goal。
- `scripts/run-dashboard-app-server-bridge.mjs` の resume/start/turn handling。
- `src/worker/runtime.js` の app_server_thread mapping と pending message drain。
- targeted bridge tests。

## 実装候補と捨てた案

- 採用: bridge event contract を先に作り、restart 復帰状態を owner-facing に出す。
- 捨てた案: systemd unit を先に変える。runtime truth がないまま restart だけ増えると、owner は余計に不安になる。
- 捨てた案: deploy 後 restart を自動実行する。deploy / host operation authority が絡むため、この PR の権限境界を超える。

## merge 後に通す E2E

- production PWA E2E で unresolved main chat を開く。
- app-server bridge restart 後に同じ Dashboard thread で bridge connected / resumed_existing_thread / turn_started status が見えることを確認する。
- repo-less ordinary chat の送信が復帰後も同じ thread で続くことを確認する。

## 次の PR を増やさない理由

この PR は後続 PR を増やさないためではなく、後続の systemd restart policy / deploy restart helper / runtime state store の前提をそろえるための最初の scope である。Issue #741 全体はまだ完了しない。

## 停止条件

- chat history や owner message persistence が失われる変更が必要になった場合。
- deploy / credential / permission / destructive host operation が必要になった場合。
- Codex app-server の非公開内部挙動を completion 前提にする必要が出た場合。
