# Issue #528 Dashboard WS read-session refresh 作戦図

## 目的

Dashboard Butler の HTML は Cloudflare Access で開けるが、通常チャット WebSocket が `dashboard_auth_required` で未接続になる状態を止める。

## 原因仮説

PR #710 は Access 認証済み Dashboard HTML response で `vtdd_dashboard_session` を発行するようにした。しかし既存 request に `vtdd_dashboard_session` cookie が存在するだけで新規発行をスキップしていた。

本番ブラウザに古い、壊れた、または memory 側に存在しない cookie が残ると、Dashboard HTML は Access headers で通る一方、WebSocket handshake は Access headers なしで古い cookie だけを送り、`dashboard_auth_required` になる。

## 改修方針

`authorizeDashboardRequest()` が `cloudflare_access` で成功した場合は、request に Dashboard cookie が存在していても新しい 8時間 read-session cookie を発行する。

この cookie は通常 Dashboard read session であり、高リスク approval grant ではない。2分 approval grant は使わない。

## 対象ファイル

- `src/worker/runtime.js`
- `test/worker.test.js`
- `worker.js`

## 非ゴール

- VPS helper / Issue #637 の実行経路変更
- deploy、credential mutation、permission mutation、root/helper 実行
- WebSocket URL token 化
- Dashboard read session を high-risk approval grant として扱うこと

## 検証

- stale `vtdd_dashboard_session` cookie があっても Cloudflare Access owner identity が valid なら Dashboard HTML response で新しい `dashboard-session:` cookie を返すこと。
- cookie の `Max-Age` が `28800` で、2分 approval grant ではないこと。
- 既存の Access-backed read-session cookie で Dashboard chat WebSocket auth が `websocket_upgrade_required` まで進むこと。
- `npm run build:worker`
- `npm run verify:worker`

## 停止条件

Dashboard read session が高リスク approval と混同される、または owner-facing Dashboard Butler ではなく Custom GPT / Action Schema 側へ逸れる場合は停止する。
