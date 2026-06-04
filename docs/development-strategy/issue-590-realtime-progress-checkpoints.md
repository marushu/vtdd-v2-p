# Issue #590 realtime progress checkpoint stream 作戦図

## 完了体験

Dashboard Butler で長時間の VPS Codex CLI / app-server bridge 作業を投げたとき、owner は無言で待たされない。低情報の状態、たとえば「考えています」「コマンドを実行しています」は composer 下の一時状態として表示し続ける。一方で owner-facing な進行 checkpoint は通常チャット欄の末尾に表示され、アプリ切替、スリープ、WebSocket 再接続後も最新 checkpoint 1件から復帰できる。

完了時は、その live progress message を最終 Butler 返信と折りたたみの `進行ログ` に一気に置き換える。通常チャット履歴に raw event や高頻度 progress message は残さない。

2026-06-04 の production E2E で、composer 下の `進行中` とチャット本文内の checkpoint が二重表示になり、さらに `codex app-server が応答を生成しています。` のような低情報 status が本文側に混ざることを確認した。以後の設計は「composer 下の進行中カードを主表示にしない」「1 turn / 1 execution に対してチャット本文内の live progress message 1件だけを更新する」「完了時だけ final summary へ置換する」に修正する。

## VTDD 全体で進める部分

この slice は #590 の realtime progress checkpoint stream の最小実装に限定する。#637 の production E2E で確認した「低リスク read/status が passkey なしで helper queue に渡る」経路を、#590 の進行表示 E2E の観測対象として使えるようにする。

## 設計

既存実装には `transient_progress_snapshot:<threadId>` があり、Durable Object に最新 snapshot 1件だけ保存される。これを新しい永続 chat message にせず、Dashboard UI が chat log 内に `live_progress_message_id` 相当の ephemeral checkpoint card として描画する。

`live_progress_message_id` は checkpoint 1件ごとの ID ではない。1 owner turn / 1 app-server turn / 1 runner execution に対して、チャット本文内に表示する一時 progress message 1個の UI identity として扱う。checkpoint が増えても message row は増やさず、その 1個の中身だけを更新する。

分類は二層にする。

- composer 下: 低情報 status の主表示場所にはしない。この slice では composer 下の progress card を非表示化し、最下部の短い status line だけに限定する。
- chat 内 live progress message: owner-facing progress。`planning` / `implementation` / `test` / `PR作成` / `CI待ち` など、作業段階が分かるものだけを 1件の一時 message として更新表示する。

完了時は現在の `attachDashboardProgressSummaryToFinalMessages` を使い、snapshot の `progressSummary` を最終返信に付ける。snapshot は最終返信後に clear されるため、chat 内 live progress message は消え、最終返信の `進行ログ` に集約される。

## 仮説

現在の不満の根は、bridge が進行 event を受けて transient snapshot へ保存しているのに、UI が「composer 下の進行中」「チャット本文内 checkpoint」「最下部 status line」を混在させていることにある。iPad でアプリ切替やスリープが入ると composer 下の一時表示は見失いやすく、owner の体感は「最後にまとめて出る」または「変な場所に出る」になる。

狭く durable chat message を増やすと、通常履歴が progress で汚れ、Cloudflare write も増える。逆に既存 snapshot を chat log 内に描画するだけなら、write volume は増えず、復帰可能性も保てる。

## 検証計画

- `DashboardChatRoom` が bridge status を受けたとき、低情報 progress は snapshot text としては保持するが `progressSummary.entries` には入れない。
- owner-facing progress は `progressSummary.entries` に入り、final reply の `進行ログ` に集約される。
- reply delta は従来通り snapshot / durable chat message にしない。
- Dashboard HTML に chat 内 checkpoint card の描画経路があり、snapshot restore / WebSocket transient update / final reply clear で動く。
- worker bundle を再生成し、generated worker 差分を一致させる。

## 改修見積もり

- `src/worker/runtime.js`
  - `buildDashboardProgressSummarySnapshot`: 低情報 progress を summary から除外する。既存 snapshot write は維持する。
- Dashboard client script: `transientProgressSnapshot.progressSummary` から最新 checkpoint を chat log 内の live progress message 1件として描画し、clear 時に消す。composer progress card は主表示として使わない。
  - Dashboard CSS: checkpoint card と progress summary の dark mode 対応を最小限整える。
- `test/worker.test.js`
  - 低情報 progress が summary に入らないこと。
  - owner-facing progress が summary と final reply に残ること。
  - thread reconnect payload は既存通り latest snapshot 1件を返すこと。
- `worker.js`
  - `npm run build:worker` で生成更新する。

## 既に通っている経路

- `scripts/run-dashboard-app-server-bridge.mjs` は `app_server_status` / `app_server_reply_delta` / `app_server_reply` を worker へ送る。
- `DashboardChatRoom.acceptAppServerBridgeMessage` は bridge event を正規化し、`transient_status` と final reply を配信する。
- `writeTransientProgressSnapshot` は DO に最新 snapshot 1件を保存する。
- `sendThread` / `broadcastThread` は `transientProgressSnapshot` を Dashboard UI に返す。
- final reply には `attachDashboardProgressSummaryToFinalMessages` で `進行ログ` を付けられる。

## 未確認の境界

- app-server bridge が 30秒以内に必ず owner-facing stage を送るかは、この slice だけでは保証しない。
- WebSocket が iPad PWA のバックグラウンドで停止する挙動自体は、この slice では直さない。復帰時に snapshot から見えることを優先する。
- raw assistant delta をそのまま checkpoint にするかは未採用。思考や未整理文を流すリスクがあるため、この slice では stage-based checkpoint に限定する。

## 穴が出そうな箇所

- 低情報判定を強くしすぎると、final `進行ログ` が薄くなる。
- chat 内 checkpoint card を通常 message と同じ DOM に入れると、copy/reply/scroll の既存挙動を壊す可能性がある。
- completion 後の clear が漏れると、古い checkpoint が final reply の下に残る。
- dark mode の progress summary 背景が light 固定だと #744 の見えづらさを悪化させる。
- media attach / pending media preview の再描画で chat log 内の live progress message が消えると、owner には「チャットに出ていたテキストが消えた」と見える。#498 本体ではないが、この slice の E2E 観測対象に入れる。

## PR 前に確認すること

- `git status --short --branch`
- targeted worker tests
- `npm run build:worker`
- `npm run check:generated-worker`
- `npm run check:self-parity`
- 可能なら `npm run verify:worker`。既知の環境依存失敗が残る場合は、失敗箇所を PR に明記する。

## 実装候補と捨てた案

採用候補は、既存 DO snapshot 1件を chat log 内の ephemeral checkpoint card として表示する案。

捨てた案:

- raw event を durable chat message として append する案。履歴汚染と DO/D1 write 増加が大きい。
- `app_server_reply_delta` をそのまま表示する案。owner-facing に未整理で、内部思考や断片表示のリスクがある。
- Cloudflare Queue / D1 に progress event stream を保存する案。#590 の目的に対して重く、コスト境界に反する。

## merge 後に通す E2E

- production PWA から #637 相当の低リスク read/status を投げ、30秒以内に chat 内 live progress message が1件だけ見えること。
- app 切替、リロード、または画像添付プレビュー追加後、最新 checkpoint が chat log 内に復帰または維持されること。
- completion 後、live progress message が消え、最終 Butler 返信に `進行ログ` が残ること。
- low-risk read/status は passkey なし、deploy / bridge restart は従来通り passkey 境界を維持すること。

## 次の PR を増やさない理由

この slice は #590 の根本 blocker に直結し、既存 snapshot 経路を再利用するため、UI と worker runtime を分けると E2E が成立しない。#741 の通知チャット化と #744 の表示崩れ本体は別 Issue として残し、この PR には混ぜない。

## 停止条件

- app-server bridge が owner-facing stage を送っていないことが判明した場合。
- snapshot 1件では復帰体験を満たせず、追加 durable event stream が必要だと判明した場合。
- chat message と checkpoint card の区別が UI/テストで曖昧になり、通常履歴を汚す恐れが出た場合。
- Issue #590 の要件と矛盾する既存 contract が見つかった場合。
