# Issue #450 / #590 app-server bridge turn timeout strategy

## 完了体験

Dashboard Butler の通常チャットで、Codex app-server の 1 turn が完了通知を返さない場合でも、owner は次の発言を送れる。画面には日本語の recoverable timeout が出て、同じ Dashboard thread に入力が保存されたまま、後続の普通の会話が `app-server bridge の返信を待っています` で永久停止しない。

## 対象 Issue

- Issue #450: Dashboard Butler live app-server path
- Issue #590: app-server timeout / recovery

## Success Criteria

- VPS app-server bridge の実運用 default が timeout 無効 `0` にならない。
- env に `VTDD_DASHBOARD_APP_SERVER_TURN_TIMEOUT_MS` が無い場合でも、一定時間で `app_server_turn_failed` timeout event を返す。
- 明示的に `VTDD_DASHBOARD_APP_SERVER_TURN_TIMEOUT_MS=0` を設定した場合は、従来どおり timeout 無効化を残す。
- timeout 後に turn queue が解放され、後続の owner message を処理できる。

## Non-goals

- #637 helper execution、root/sudo、credential、permission、deploy はこの PR で実行しない。
- app-server bridge service restart はこの PR のコード変更では行わない。
- Dashboard UI 全体の再設計や任意 thread bridge 多重化は扱わない。
- Codex app-server の内部 protocol 変更や model timeout 調整は扱わない。

## 原因仮説

本番の `dashboard-main-unresolved` で #637 helper completion 後、普通の owner 発言が `app-server bridge の返信を待っています` のまま戻らない。VPS の bridge env には `VTDD_DASHBOARD_APP_SERVER_TURN_TIMEOUT_MS` が無く、`parseBridgeArgs()` の default は `0` で timeout 無効だった。`connectDashboardAppServerBridgeOnce()` は turn を `turnQueue` で直列化しているため、1 turn が完了通知を返さないと後続の通常会話が全て待たされる。

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`: 実運用 default timeout を 120 秒にする。明示 `0` は維持する。
- `test/dashboard-app-server-bridge.test.js`: env 未指定時の default timeout と明示 `0` の保持を固定する。
- `worker.js`: worker build が触る場合のみ生成物を更新する。

## 検証計画

- `node --test test/dashboard-app-server-bridge.test.js --test-name-pattern "turn timeout|bridge args"`
- `npm run build:worker`
- `npm run verify:worker`

## 予測される残リスク

この PR は queue 永久停止を防ぐ。既に本番で詰まっている 5/29 起動中の bridge process は、merge/deploy 後に service が再起動されるまで新しい script を読まない。production E2E では deploy 後に bridge process の script 反映状態と、同じ unresolved thread で普通の会話が timeout 後も継続できることを確認する。
