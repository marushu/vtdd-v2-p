# Issue #413 / #590: transient progress snapshot

## 完了体験

owner が Dashboard Butler で長い app-server turn を待っている間に iPad をスリープしたり、別アプリへ移動したりしても、復帰後に「何も分からない」状態へ戻らない。

Dashboard thread は通常チャット履歴を汚さず、最後に確認できた進行状態を 1 件だけ復元して表示する。完了返信、失敗、timeout recovery が来たら snapshot は消え、古い `考えています` が残り続けない。

## VTDD 全体で進める部分

- Issue #590: silent wait / timeout recovery の残りである owner-facing observability を進める。
- Issue #413: owner-facing progress を chat history に積み上げず表示する。
- Issue #748: `presence != persistence` の境界を守り、高頻度 durable write を避ける。

## 設計

`app_server_reply_delta` は引き続き durable chat message にしない。app-server bridge の status event、owner message dispatch、bridge reconnect のような owner-facing milestone だけを対象に、DashboardChatRoom Durable Object storage に thread ごとの compact snapshot を 1 件だけ保存する。

snapshot は chat store / D1 / GitHub comment / RAG ではなく Durable Object storage の single key に限定する。保存対象は `threadId`, `status`, `text`, `updatedAt`, `source` のみ。raw delta、terminal log、chain-of-thought、full transcript は保存しない。

## 仮説

現状の復帰時に progress が消える原因は、`broadcastTransientStatus` が WebSocket へだけ送信し、`sendThread` と HTTP thread fetch が保存済み messages だけを返すため。

`sendThread` と HTTP thread fetch に last snapshot を含め、UI が `transientProgressSnapshot` を読み込めば、iPad sleep / app switch 復帰時に generic な「返信待ち」ではなく最後に観測した進行状態を出せる。

狭く `restoreThreadRecoveryState` だけを直すと、実際にどの stage だったかを失い、また「考えています」だけに戻る。逆に全 progress を durable message にすると #748 の cost incident を再発させる。

## 検証計画

- Unit: app-server status snapshot が thread WebSocket 初期 payload に含まれる。
- Unit: app-server reply delta は snapshot に保存されない。
- Unit: app-server final reply / failed / stalled で snapshot が消える。
- Unit: 同じ snapshot の連続 status は storage put を増やさない。
- UI static: HTTP refresh result の `transientProgressSnapshot` を `updateTransientProgress` へ渡す処理が存在する。
- Verification: `npm run build:worker`、`node --test test/worker.test.js`、`npm run check:generated-worker`、`git diff --check`。

## 改修見積もり

- `src/worker/runtime.js`
  - `DashboardChatRoom`: snapshot read/write/clear helper を追加する。risk は DO storage write count の増加。
  - `broadcastTransientStatus`: opt-in snapshot 書き込みを追加する。risk は delta を誤って保存すること。
  - `sendThread` / `broadcastThread`: payload に snapshot を追加する。risk は UI 互換。
  - `handleDashboardChatThreadRequest`: HTTP refresh 用に snapshot を返す。risk は DO fetch 経由の追加 read。
  - inline UI script: `refreshThread` と WebSocket `thread` handler が snapshot を復元する。risk は stale progress 表示。
- `worker.js`: generated worker 更新。
- `test/worker.test.js`: snapshot と UI static test を追加する。

## 既に通っている経路

- `app_server_reply_delta` は chat history へ保存されない。
- 低情報 progress は durable chat history を汚染しない。
- timeout / failed は owner-facing Japanese recovery message として thread に残る。
- refreshThread は HTTP で thread messages を再取得できる。

## 未確認の境界

- production iPad の sleep / app switch で WebSocket が必ず切れるか、HTTP refresh だけになるかは端末依存。
- Dashboard DO storage の single-key snapshot write が Cloudflare rowsWritten 上でどの程度増えるかは production metrics で確認が必要。
- stop / interrupt / cancel の runtime signal はこの PR では未接続。

## 穴が出そうな箇所

- snapshot を reply delta から作ると raw partial answer が保存され、cost / privacy / readability が悪化する。
- final reply 後に snapshot を消さないと stale spinner が残る。
- HTTP refresh が snapshot を返さないと、visibilitychange 復帰で generic recovery に戻る。
- unchanged snapshot の連続保存を許すと #748 の rowsWritten incident に近づく。

## PR 前に確認すること

- snapshot の保存は opt-in で、delta では呼ばれない。
- final reply / failed / stalled で snapshot が clear される。
- `thread` payload は後方互換の JSON field 追加のみ。
- owner-facing prose は日本語。

## 実装候補と捨てた案

- 採用: single-key compact snapshot。復帰可能性と cost 境界のバランスが良い。
- 捨てた案: progress を chat message として保存する。履歴汚染と rowsWritten 増加が大きい。
- 捨てた案: client sessionStorage だけで保持する。iPad sleep / reload / WebSocket reconnect の復帰根拠にならない。
- 捨てた案: app-server reply delta を snapshot にする。partial response と chain-of-thought 誤認の risk がある。

## merge 後に通す E2E

- production Dashboard Butler で長めの app-server turn を開始する。
- app-server status が出た状態で iPad / Safari PWA を別アプリへ切り替える。
- 復帰後、最後に確認できた進行状態が chat 近辺に復元されることを確認する。
- final reply 後に stale progress が残らないことを確認する。

## 次の PR を増やさない理由

この PR は #590/#413 の owner-facing observability の最小単位で、#748 の cost 境界を壊さないために scope を snapshot 復帰に限定する。stop/interrupt、runner phase、deploy/reviewer 通知を同時に入れると、cost 境界と UX 設計が混ざる。

## 停止条件

- snapshot 保存が高頻度 delta から呼ばれることが判明した場合。
- DO storage の unchanged put を避けられない場合。
- HTTP refresh に snapshot を戻す経路が安全に作れない場合。
- Issue #748 の `presence != persistence` 境界に反する変更が必要になった場合。
