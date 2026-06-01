# Issue #590 debug slow turn harness

## 完了体験

Dashboard Butler から `Issue #590 の slow turn を 3分で実行して` のように自然文で依頼すると、Codex 本体の処理時間に依存せず、同じ Dashboard thread に progress と completion が返る。owner は 2分固定 timeout の有無、quiet/progress 表示、same-thread continuation を production PWA で再現性を持って確認できる。

## VTDD 全体で進める部分

Issue #590 の E2E evidence gap を埋めるための低リスク診断ルートを追加する。これは通常開発機能ではなく、timeout / reconnect / late completion / silent wait の回帰確認に使う debug/E2E ハーネスである。

## 設計

- `scripts/run-dashboard-app-server-bridge.mjs` で Issue #590 slow-turn 文脈を検出する。
- 検出条件は `Issue #590` と `slow turn` / `debug_slow_turn` / `timeout e2e` の明示に限定する。
- `durationSeconds` は自然文の `N秒` / `N分` / `Ns` / `Nm` から読む。
- 許可範囲は 10 秒から 10 分まで。範囲外は実行せず owner-facing failed event を返す。
- 実行中は同じ `app_server_status` 経路で debug progress を流し、終了時は `app_server_reply` を返す。
- Codex turn は起動しない。repo mutation、root、deploy、credential、permission mutation はしない。

## 仮説

Issue #590 の production E2E が難しい理由は、自然な Codex 作業時間が再現不能だからである。bridge 層で低リスク slow-turn を再現できれば、Dashboard PWA / WebSocket / transient status / same-thread completion の挙動を deterministic に観測できる。

狭く timeout 値だけを変えると、owner が指摘した「5分無音で最後にまとめて返る」問題を見逃す。slow-turn ハーネスは progress event が PWA に実際に届くかを観測するための土台になる。

## 検証計画

- `node --test test/dashboard-app-server-bridge.test.js --test-name-pattern "debug slow turn|bridge args"`
- `node --test test/dashboard-app-server-bridge.test.js`
- `npm run build:worker`
- `npm run check:generated-worker`
- `git diff --check`

production E2E では owner が Dashboard Butler から `Issue #590 の slow turn を 3分で実行して` を送り、旧 2分 SYSTEM 文言が出ないこと、progress が出ること、同じ thread に完了が戻ることを確認する。

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`: slow-turn 検出、duration parser、simulated progress/reply 追加。リスクは通常文の誤検出。
- `test/dashboard-app-server-bridge.test.js`: duration parser、範囲外拒否、Codex を呼ばない slow-turn event sequence を固定。リスクは timer 依存の flaky 化なので test では delay を注入する。
- `docs/development-strategy/issue-590-debug-slow-turn-harness.md`: この作戦図。実行挙動なし。

## 既に通っている経路

PR #727 で 2分固定 hard timeout は 10分 default に変更され、quiet status と late completion の既存テストはある。Issue #590 は open のままで、production 長時間 E2E evidence が不足している。

## 未確認の境界

production VPS app-server bridge service が merge 後にいつ最新 script を読むかは、この PR では変えない。deploy / service restart は passkey 境界であり、この PR では実行しない。

## 穴が出そうな箇所

自然文検出が広すぎると通常チャットを debug harness に吸い込む。必ず Issue #590 文脈と slow-turn/debug/e2e 語を要求する。

## PR 前に確認すること

- Issue #590 が `Now` の parent root であること。
- slow-turn が high-risk 操作ではないこと。
- generated `worker.js` が必要な場合は `npm run build:worker` で同期すること。

## 実装候補と捨てた案

採用: 1つの `debug_slow_turn(durationSeconds)` 相当の自然文ハーネス。

捨てた案: `2分用` / `5分用` preset を複数作る。固定 preset が増えて保守性が悪く、owner が求める「引数で分数指定」に合わない。

捨てた案: timeout を 0 にする。永久詰まりを検出できなくなる。

## merge 後に通す E2E

- 30秒 slow-turn で progress/reply が同じ thread に返ることを短時間確認する。
- 3分 slow-turn で旧 2分 SYSTEM 文言が出ないことを確認する。
- 必要な時だけ 5分超 slow-turn を走らせ、silent wait / reconnect 表示を観測する。

## 次の PR を増やさない理由

この PR は Issue #590 の E2E harness に閉じる。実際の Codex progress をもっと細かく owner-facing に流す改善、stop/interrupt UI、final answer formatting は別 Issue/PR で扱う。

## 停止条件

slow-turn が通常 owner message を誤検出する、duration 上限なしになる、repo mutation/root/deploy/credential に触れる、または production service restart が必要になる場合は停止する。
