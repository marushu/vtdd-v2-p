# Issue #450 Dashboard WebSocket accept origin strategy

## 完了体験

Owner が iPhone / Mac の Dashboard Butler で通常チャットを開くと、WebSocket が実際に DashboardChatRoom へ接続され、入力したメッセージが同じ thread に保存される。接続成立前に owner が送ったテキストは保持され、接続復帰後に WebSocket 経由で送られる。

## VTDD 全体で進める部分

Issue #450 / #654 の通常チャット経路を、HTTP persistence fallback ではなく WebSocket 本命に戻す。今回の slice は WebSocket 入口そのものを落としているスコープ外参照を直し、入口 regression test を追加する。

## 設計

DashboardChatRoom.fetch() で request URL を読み、`url.origin` を `acceptSocket()` に明示的に渡す。`acceptSocket()` は自分のスコープ外にある `url` 変数を参照しない。Dashboard owner socket と app-server bridge socket の両方で attachment に origin を保持し、Issue #637 の approval URL origin 伝搬は維持する。

## 仮説

PR #708 が `DashboardChatRoom.acceptSocket()` 内へ `origin: url.origin` を追加したが、`url` は `fetch()` のローカル変数であり `acceptSocket()` のスコープには存在しない。実 WebSocket handshake は Durable Object 内で `acceptSocket()` を通るため ReferenceError になり、Dashboard HTML と thread fetch は動くのに WebSocket だけ切れ続ける。

この仮説は iPhone の「WebSocket が切れました。入力は保持し、再接続後に自動送信します。」という状態と一致する。app-server bridge 未接続なら owner message は保存されるはずなので、今回は bridge 以前の browser WebSocket 接続不成立が root と読む。

## 検証計画

`DashboardChatRoom.fetch()` を WebSocket upgrade request で直接呼ぶ regression test を追加し、`acceptSocket()` がスコープ外 `url` 参照で落ちないこと、attachment に request origin が保存されることを確認する。既存の `handleSocketMessage()` 直呼びテストだけでは入口破損を拾えないため、入口テストを必須にする。

## 改修見積もり

- `src/worker/runtime.js`: `acceptSocket({ request, role, threadId, origin })` に変更し、Dashboard/app-server の呼び出し側から `url.origin` を渡す。リスクは app-server bridge attachment origin の保持だけで、authority boundary は変えない。
- `test/worker.test.js`: mock `WebSocketPair` と mock Durable Object state を用意し、`DashboardChatRoom.fetch()` の upgrade 経路を実行する。リスクは Node test 環境差分なので、global の退避/復元を行う。
- `worker.js`: generated worker を `npm run build:worker` で更新する。

## 既に通っている経路

Dashboard HTML は表示され、thread history fetch も動いている。Issue #528 の read session cookie と Issue #654 の WebSocket owner message persistence はコード上存在する。

## 未確認の境界

本番 Cloudflare / Safari / PWA で WebSocket が 101 まで通るかは merge/deploy 後の live E2E が必要。今回の修正は明白な runtime exception を塞ぐが、Cloudflare Access cookie や network close の別原因が残る可能性は live で確認する。

## 穴が出そうな箇所

入口テストがないと、内部 message handling test が通っても本番 WebSocket が死ぬ。今後 origin や auth を触る PR は `DashboardChatRoom.fetch()` の upgrade 経路を通すテストを持たない限り不十分。

## PR 前に確認すること

Issue #450 / #654 / #528、PR #708 / #713 / #714 の差分、`DashboardChatRoom.acceptSocket()`、`handleDashboardChatSocketRequest()`、Dashboard inline reconnect code を確認する。

## 実装候補と捨てた案

採用案は origin を明示引数にする案。捨てた案は HTTP fallback 復活、repo に production 固定 URL を埋める案、UI 文言だけ変える案、Cloudflare 設定問題として扱ってコードを触らない案。

## merge 後に通す E2E

Production deploy 後、Dashboard Butler を iPhone / Mac Chrome で開き、通常チャットへ「テスト」を送る。ステータスが WebSocket 切断のまま固定されず、owner message が同じ thread に表示され、Butler / app-server bridge 側の応答または pending truth へ進むことを確認する。テストや docs には production 固定 URL を埋めず、中立 origin を使う。

## 次の PR を増やさない理由

今回の root は一行のスコープ外参照と、それを拾えない入口テスト不足に閉じている。HTTP fallback や app-server timeout へ広げず、まず WebSocket handshake が成立する最低線を戻す。

## 停止条件

入口テストで WebSocket route がまだ accept できない、または修正に auth boundary 緩和が必要になる場合は停止する。WebSocket 送信ではなく HTTP persistence fallback を通常会話の完成扱いにする案が必要になった場合も停止する。
