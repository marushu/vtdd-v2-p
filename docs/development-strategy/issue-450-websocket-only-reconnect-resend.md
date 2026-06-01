# Issue #450 WebSocket-only reconnect resend 作戦図

## 目的

Dashboard Butler の通常会話を WebSocket live path に戻す。

HTTP fallback は会話経路ではない。owner message を VPS Codex CLI に届けて
返信を Dashboard thread に戻す経路は、DashboardChatRoom WebSocket から
app-server bridge へ `app_server_turn_requested` を送る path だけである。

## 予測

PR #712 は HTTP persistence を「送信できます」と表示したが、これは誤りだった。
`/v2/dashboard/chat/messages` は保存退避路であり、VPS Codex CLI には届かない。

そのため、WebSocket 未接続時に owner が送信した内容は HTTP に逃がさず、
`pendingOwnerSend` として保持し、WebSocket 再接続後に同じ `clientMessageId`
で再送する。

## 改修方針

- Dashboard 通常会話の submit path から HTTP fallback 送信を外す。
- WebSocket が未接続なら入力と添付参照を保持し、接続後に自動送信する。
- WebSocket close/error が送信確認前に起きても、入力を消さず pending を維持する。
- ACK が返らない場合は同じ `clientMessageId` で再送し、server-side dedupe に委ねる。
- owner-facing status は「接続中」「入力保持」「接続後に送信」に限定する。
- `WebSocket は未接続ですが、送信できます` のような誤表示を禁止する。

## 対象ファイル

- `src/worker/runtime.js`
- `test/worker.test.js`
- `worker.js`

## 非ゴール

- `/v2/dashboard/chat/messages` を会話 fallback として強化しない。
- deploy、credential mutation、permission mutation、root/helper 実行はしない。
- Issue #654 / #450 / #528 の close はこの PR では行わない。

## 検証

- Dashboard HTML contract test で HTTP fallback 送信関数と誤表示文言がないことを固定する。
- Dashboard HTML contract test で reconnect 後の pending resend 文言と関数を固定する。
- `npm run build:worker`
- `npm run verify:worker`

## merge 後 E2E

production deploy 後、Dashboard Butler を開き、WebSocket 切断時に owner 入力が
HTTP 保存へ逃げず、再接続後に同じ thread で VPS Codex CLI へ送られ、Butler の
返信が戻ることを確認する。
