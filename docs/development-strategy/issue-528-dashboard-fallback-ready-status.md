# Issue #528 Dashboard fallback ready status 作戦図

## 目的

Dashboard Butler で WebSocket が未接続のままでも、HTTP fallback で履歴取得と送信が可能な状態なら「使えない」表示にしない。

## 予測

本番 deploy 後も Mac Chrome で `websocketState=未接続` だった。一方で Dashboard の submit button は disabled ではなく、既存コードには `sendOwnerMessageByHttp()` がある。

コードを読むと、`refreshThread()` は HTTP で履歴取得に成功しても composer status を更新していない。そのため初期表示の `接続準備中です。送信できる状態になったら知らせます。` が残り続け、HTTP fallback が使える場合でも owner には Butler が使えないように見える。

## 改修方針

`refreshThread()` が成功した時、WebSocket が開いていなければ Dashboard status を「WebSocket は未接続ですが、送信できます。再接続を続けています。」へ更新する。あわせて `status.dataset.httpFallbackReady` を `true` にして、live E2E で UI truth を読めるようにする。

履歴取得が失敗した時は `httpFallbackReady=false` に戻す。

## 対象ファイル

- `src/worker/runtime.js`
- `test/worker.test.js`
- `worker.js`

## 非ゴール

- WebSocket handshake の根本原因を隠すこと
- WebSocket auth / Cloudflare Access / cookie 境界の追加変更
- VPS helper / Issue #637 の実行経路変更
- deploy、credential mutation、permission mutation、root/helper 実行

## 検証

- Dashboard HTML contract test で `setHttpFallbackReadyStatus()`、`httpFallbackReady=true/false`、owner-facing fallback-ready 文言を固定する。
- `npm run build:worker`
- `npm run verify:worker`

## merge 後 E2E

production deploy 後、Dashboard Butler を開き、WebSocket が未接続でも HTTP fallback が成功した場合は composer status が「送信できます」に変わること、通常メッセージ送信が保存されることを確認する。
