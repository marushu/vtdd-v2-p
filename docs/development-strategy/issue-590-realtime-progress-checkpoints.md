# Issue #590 realtime progress checkpoint stream 作戦図

## 完了体験

Dashboard Butler で長時間の VPS Codex CLI / app-server bridge 作業を投げたとき、owner は無言で待たされない。低情報の状態、たとえば「考えています」「コマンドを実行しています」は composer 下の一時状態として表示し続ける。一方で owner-facing な進行 checkpoint は通常チャット欄の末尾に表示され、アプリ切替、スリープ、WebSocket 再接続後も最新 checkpoint 1件から復帰できる。

完了時は checkpoint 表示を消し、最終 Butler 返信に折りたたみの `進行ログ` として集約する。通常チャット履歴に raw event や高頻度 progress message は残さない。

2026-06-04 の PR #778 production E2E では、composer 下の `進行中` を主表示から外した結果、低情報の `codex app-server が応答を生成しています。` が chat 本文側に出続け、さらに checkpoint 更新で scroll が下へ戻る体験が発生した。これは #590 の意図に反するため、次 slice では PR #778 の UI 改変を rollback し、低情報 status を元の composer 下表示へ戻す。owner-facing checkpoint 生成不足は別 slice として bridge/app-server event 分類を調査する。

2026-06-04 の追加 production 観測で、開発中に画面が下へチラチラ引っ張られる挙動が出た。原因候補は live progress checkpoint / thread refresh のたびに `scrollToLatest()` が無条件実行されること。owner が途中の進行を読んでいる場合は、最新 checkpoint が来ても scroll position を保持し、最下部付近にいる場合だけ追従する必要がある。

2026-06-04 の PR #780 deploy 後、composer 下の transient status は戻ったが、chat-visible live progress は相変わらず出ないことを owner が確認した。bridge が `planning` / `command` / `file_change` のような具体 event を受けられない turn でも、30秒以内に owner-facing fallback checkpoint を生成しなければ、#590 の無言待ち解消にはならない。

2026-06-04 の添付 evidence で、入力欄下の `進行中` には「その通りです。今の時点で #590 は終わっていません...」のような readable progress が既に出ていることを確認した。これは `app_server_reply_delta` の `progressText` として届いているため、chat-visible checkpoint に昇格できる。raw delta を durable message 化するのではなく、transient snapshot の latest assistant delta checkpoint として表示し、final summary には最新1件だけ残す。

2026-06-04 の追加調査で、bridge は `command` / `file_change` / `tool_call` など低情報 event を `ownerFacingProgressSeen=true` と扱って fallback timer を止めていた。一方 Worker は「コマンドを実行しています」「ファイル変更を確認しています」系を progress summary から除外する。結果として、低情報 event が fallback を潰し、chat-visible checkpoint が出ない。次 slice は、fallback 停止条件を summary に残る owner-facing stage のみに狭める。

## VTDD 全体で進める部分

この slice は #590 の realtime progress checkpoint stream の最小実装に限定する。#637 の production E2E で確認した「低リスク read/status が passkey なしで helper queue に渡る」経路を、#590 の進行表示 E2E の観測対象として使えるようにする。

## 設計

既存実装には `transient_progress_snapshot:<threadId>` があり、Durable Object に最新 snapshot 1件だけ保存される。これを新しい永続 chat message にせず、Dashboard UI が chat log 内に ephemeral checkpoint card として描画する。

分類は二層にする。

- composer 下: transport/transient 状態。`thinking` / `command` / `quiet` など低情報の状態も表示する。
- chat 内 checkpoint: owner-facing progress。`planning` / `implementation` / `test` / `PR作成` / `CI待ち` など、作業段階が分かるものだけを表示する。

完了時は現在の `attachDashboardProgressSummaryToFinalMessages` を使い、snapshot の `progressSummary` を最終返信に付ける。snapshot は最終返信後に clear されるため、chat 内 checkpoint card も消える。

## 仮説

現在の不満の根は、bridge が進行 event を受けて transient snapshot へ保存しているのに、UI がそれを composer 下の「進行中」枠としてしか描画していないことにある。iPad でアプリ切替やスリープが入ると composer 下の一時表示は見失いやすく、owner の体感は「最後にまとめて出る」になる。

狭く durable chat message を増やすと、通常履歴が progress で汚れ、Cloudflare write も増える。逆に既存 snapshot を chat log 内に描画するだけなら、write volume は増えず、復帰可能性も保てる。

## 検証計画

- `DashboardChatRoom` が bridge status を受けたとき、低情報 progress は snapshot text としては保持するが `progressSummary.entries` には入れない。
- owner-facing progress は `progressSummary.entries` に入り、final reply の `進行ログ` に集約される。
- reply delta は従来通り snapshot / durable chat message にしない。
- Dashboard HTML に chat 内 checkpoint card の描画経路があり、snapshot restore / WebSocket transient update / final reply clear で動く。
- live progress checkpoint と thread refresh は、更新前に最下部付近だった場合だけ自動追従する。owner が途中を読んでいる場合は scroll position を壊さない。
- app-server bridge は、具体 progress event が届かない turn でも 30秒以内に owner-facing fallback checkpoint を送る。
- app-server reply delta の readable `progressText` は、入力欄下だけでなく chat-visible checkpoint としても出す。ただし raw delta を通常 chat history に永続化しない。
- worker bundle を再生成し、generated worker 差分を一致させる。

## 改修見積もり

- `src/worker/runtime.js`
  - `buildDashboardProgressSummarySnapshot`: 低情報 progress を summary から除外する。既存 snapshot write は維持する。
  - Dashboard client script: `transientProgressSnapshot.progressSummary` から最新 checkpoint を chat log 内に ephemeral card として描画し、clear 時に消す。
  - Dashboard client script: `isNearLatest()` / conditional scroll helper を追加し、progress update / thread refresh の無条件 scroll を止める。
  - Dashboard CSS: checkpoint card と progress summary の dark mode 対応を最小限整える。
  - `app_server_reply_delta` の snapshot 化では、latest delta entry を差し替えることで final `進行ログ` の重複増殖を防ぐ。
- `scripts/run-dashboard-app-server-bridge.mjs`
  - turn 開始後、owner-facing progress event が一定時間届かない場合に `long_turn_checkpoint` を送る。
  - `command` / `file_change` / `tool_call` のような低情報 event では fallback を止めず、`planning` / `implementation` / `test` / `pr_create` など owner-facing stage でのみ fallback を止める。
  - checkpoint は raw delta ではなく、turn lifecycle 由来の低頻度 owner-facing 文に限定する。
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

- app-server bridge が 30秒以内に owner-facing stage を送ることは、この slice で fallback として保証する。ただし WebSocket が iPad バックグラウンドで停止している間の即時表示は保証しない。
- WebSocket が iPad PWA のバックグラウンドで停止する挙動自体は、この slice では直さない。復帰時に snapshot から見えることを優先する。
- raw assistant delta をそのまま checkpoint にするかは未採用。思考や未整理文を流すリスクがあるため、この slice では stage-based checkpoint に限定する。
- `long_turn_checkpoint` が production PWA で 30秒以内に見えるかは merge/deploy 後 E2E で確認する。local test は fallback event と snapshot 化までの証拠に留める。

## 穴が出そうな箇所

- 低情報判定を強くしすぎると、final `進行ログ` が薄くなる。
- chat 内 checkpoint card を通常 message と同じ DOM に入れると、copy/reply/scroll の既存挙動を壊す可能性がある。
- completion 後の clear が漏れると、古い checkpoint が final reply の下に残る。
- dark mode の progress summary 背景が light 固定だと #744 の見えづらさを悪化させる。
- scroll guard を広げすぎると、新規返信を受け取ったのに owner が気づきにくくなる。今回は live progress / refresh の追従だけを条件付きにし、通常 append の挙動は維持する。

## PR 前に確認すること

- `git status --short --branch`
- targeted worker tests
- `npm run build:worker`
- `npm run check:generated-worker`
- `npm run check:self-parity`
- 可能なら `npm run verify:worker`。既知の環境依存失敗が残る場合は、失敗箇所を PR に明記する。

## 実装候補と捨てた案

採用候補は、既存 DO snapshot 1件を chat log 内の ephemeral checkpoint card として表示し、bridge が具体 event を送れない turn では `long_turn_checkpoint` を低頻度に送る案。

捨てた案:

- raw event を durable chat message として append する案。履歴汚染と DO/D1 write 増加が大きい。
- `app_server_reply_delta` をそのまま表示する案。owner-facing に未整理で、内部思考や断片表示のリスクがある。
- Cloudflare Queue / D1 に progress event stream を保存する案。#590 の目的に対して重く、コスト境界に反する。

## merge 後に通す E2E

- production PWA から #637 相当の低リスク read/status を投げ、30秒以内に chat-visible owner-facing checkpoint が見えること。
- 入力欄下に readable progress が出た場合、同じ内容または要約された最新内容が chat 欄の checkpoint にも見えること。
- `command` / `file_change` の低情報 event が先に来ても、fallback checkpoint が潰れないこと。
- app 切替またはリロード後、最新 checkpoint が chat log 内に復帰すること。
- owner が途中を読んでいる状態で checkpoint が更新されても、画面が下に引っ張られないこと。
- completion 後、checkpoint card が消え、最終 Butler 返信に `進行ログ` が残ること。
- low-risk read/status は passkey なし、deploy / bridge restart は従来通り passkey 境界を維持すること。

## 次の PR を増やさない理由

この slice は #590 の根本 blocker に直結し、既存 snapshot 経路を再利用するため、UI と worker runtime を分けると E2E が成立しない。#741 の通知チャット化と #744 の表示崩れ本体は別 Issue として残し、この PR には混ぜない。

## 停止条件

- app-server bridge が owner-facing stage を送っていないことが判明した場合。
- snapshot 1件では復帰体験を満たせず、追加 durable event stream が必要だと判明した場合。
- chat message と checkpoint card の区別が UI/テストで曖昧になり、通常履歴を汚す恐れが出た場合。
- Issue #590 の要件と矛盾する既存 contract が見つかった場合。
