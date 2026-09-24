# Issue #853 — Butler notification and monitoring home

Planning tier: root (new authenticated monitor-state persistence/API).
Current owner instruction explicitly selects the notification PWA home as this bounded task. Other active work and the running monitor remain unchanged.

## 完了体験
`/dashboard` opens a polished Japanese-first iPhone overview: items needing attention, current monitors, latest notification history. A past stopped notification is not confused with the current monitor state. Existing chat, notification settings, installation identity and Web Push still work.

## 設計
Add a reusable authenticated monitor snapshot API and D1 store with server receipt times. Read-only external reporters publish allowlisted summaries; UI never accesses machines or credentials. Compute freshness at read time and on the client; stale heartbeat or stale successful check must never appear as healthy. Show observed result, last attempt/success, next scheduled check, interval, automation scope and required human action separately. Do not infer completion from Push delivery or notification acknowledgment.
New home uses the existing dashboard authentication and session-cookie issuance. `/dashboard/chat` preserves chat; `/orchestrator` and deep notification links retain their behavior. Existing `/dashboard.webmanifest` start_url, icon and scope remain unchanged; route contents supply the new home. No silent Web Push subscription replacement.

## 仮説
The existing notification store carries history but no independent, fresh task state. Adding only a prettier history view would preserve the core misrepresentation. A separate monitor snapshot table plus read-only reporter closes that gap without touching running monitors.

## 検証計画
Unit: strict input/size/time/link validation, expiry, failures, stopped/alive distinctions, completed evidence, notification summaries, XSS. Integration: authenticated GET/POST, unauthorized rejection, persisted data retrieval, stale/out-of-order rejection, no Push dispatch from heartbeat, existing chat/navigation/Push regression. E2E: 390px mobile and desktop light/dark, live refresh, offline/401, no data, stale data, historical notification vs current status. Generate worker then run scoped tests; one full test suite. Production requires the existing scoped passkey boundary, followed by live reporter/UI checks.

## 改修見積もり・範囲
`src/core/dashboard-monitor-state.js` (new validation/store/view model), `src/worker/dashboard-monitor-home.js` (new UI), `src/worker/runtime.js` (bounded routes/auth integration/navigation), `scripts/report-dashboard-monitor.mjs` (read-only generic reporter), focused tests and generated `worker.js`. No environment credentials, private machine paths or actual monitor details in committed code.

## 既に通っている経路・未確認の境界
Existing dashboard auth/session, D1-backed event history, PWA Web Push and notification-click routing are implemented. New monitor ingestion, reporter, home E2E and production rollout are not yet verified. Development is isolated from other worktrees and live monitors.

## リスク・棄却案・停止条件
Reject replacing the running monitor, emitting Push heartbeats, inventing connected services, using stale local boolean as health, displaying tokens/raw IDs, adding fake stop/resume buttons, or changing auth/passkey policy. Stop only unsafe rollout if deployed revision/auth/persistence cannot be reconciled. Keep existing runtime untouched until tests and rollout boundary are satisfied. Use one coherent PR, not disconnected UI-only and truth-only PRs. Rollback restores previous Worker revision; the additive snapshot table may remain safely unused. Other Issues stay incomplete/in scope of their own work.

## ローカル実装の契約と引き継ぎ（2026-09-24）

状態: `incomplete`（隔離 worktree の実装・検証。公開、デプロイ、実 reporter 接続は未実施）。

- `POST /v2/dashboard/monitors`: 既存 gateway machine auth。JSON オブジェクト1件、UTF-8で16KB以下。`source` と `id` は小文字英数字・ハイフン・アンダースコアで各64文字まで。同一キーの観測時刻は厳密に増加させる。全体で100件まで。
- `GET /v2/dashboard/overview`: 既存 dashboard auth、`no-store`。D1 binding は既存 `VTDD_MEMORY_D1`（`MEMORY_D1` も受理）。テストでは `DASHBOARD_MONITOR_STORE` を注入可能。保存先未接続は503、接続済み0件とは区別する。
- スナップショット: `status` は `unknown/checking/no_slots/available/error/action_required/completed/stopped`、`mode` は `monitoring/executing/paused`、`type` は `monitor/task`。`observedAt/lastAttemptAt/lastSuccessAt/completedAt` はUTC ISO時刻、未来許容は120秒。`nextCheckAt` は予定時刻なので未来を許す。観測不足は未確認。`receivedAt` はサーバーが付与する。
- 完了は `status=completed` と `completedAt/evidenceSummary` が必要。`automaticBookingEnabled` は表示情報で、予約権限を付与しない。`actionURL` は `/dashboard`、`/dashboard/chat`、`/dashboard/notifications` のみ。生の状態ファイルを保存せず、概要フィールドもパス・ホスト名・認証情報らしい文字列を拒否する。
- `/dashboard` はホーム。`/dashboard/chat` と `/orchestrator` は既存チャット。既存 `threadId/thread_id/repository/repositoryInput/issueNumber` クエリ付きトップもチャットに接続する。manifestとPushハンドラーは変更しない。

### Reporter 設定

`scripts/report-dashboard-monitor.mjs --config <絶対パスのJSON> [--once]`。
この作業では起動していない。設定は `statePath`（実行先の状態JSON絶対パス）、`runtimeUrl`（HTTPS origin）、`source/id/title/description/automationScope` と任意の `expectedCommand`（Node監視コマンドの識別文字列）。資格情報は既存環境変数 `VTDD_GATEWAY_BEARER_TOKEN` からのみ読む。設定や状態に埋め込まない。

状態JSONは上記スナップショットの観測フィールドと `pid` を持つ汎用契約。PIDはローカル検証専用で送信しない。`startedAt` と `ps lstart` をUTCで照合し、Nodeプロセス名も確認する。許容差は既定5秒、設定 `startTimeToleranceSeconds` は0〜30秒。コマンドが利用可能なら任意の `expectedCommand` も照合する。stdinから起動したbare Nodeは名前と開始時刻で判定する。不一致・検査不能は未確認、プロセス不在は停止。実際の監視側との項目対応とコマンド識別は接続前のレビュー事項。

インスタンスロックは設定ファイル名に `.reporter.lock` を加えた場所に排他的に作成し、自分のロックだけ終了時に削除する。既存ロックは自動削除しない。通常60秒間隔、HTTP失敗はバックオフ、redirectは禁止。監視プロセス自体の起動・停止・ブラウザ操作は行わない。

### 検証と残る確認

- 最終の対象単体・DOM・実 Worker routes・既存 `test/worker.test.js` は322件すべて成功（新規21件、既存Worker301件）。D1 SQLはローカルSQLite上でも容量・順序・upsertを検証。
- `npm run build:worker`、generated worker検査、runtime self-parity（35 routes / 35 operationIds）を実行。
- `npm test` は1回実行: 1301件中1298 pass、2 fail、1 skip。失敗2件は既存VPS helper queueテストがworktree外の既定ログへ書き込もうとしてsandboxの `EPERM` で拒否されたもの。制限を緩和した再実行や対象外ファイルの修正は行わない。
- `scripts/e2e-issue853-monitor-home.mjs` は外部通信を遮断し実Workerをメモリ内で呼ぶブラウザハーネス。390pxのlight/dark、desktop、履歴と現在状態の分離、offline/401/503/空状態を検証し、スクリーンショットを `.local/issue-853/` に出力する設計。この環境ではChromiumが起動時に終了し、ブラウザE2E・画像は未生成。プロファイルは作業ディレクトリ内の一時領域を使い、終了時に削除する。
- 実D1サービス、実reporter、iPhone実機、実Push、本番配備は未検証。既存PWAの実機継続利用と最終デザインはレビューが必要。

### Execution Queue Delta

対象は owner が指定した #853 のみ。ほかのPR・監視・active Issueには触れず、縮小・完了扱いもしない。ローカル実装の引き渡しまでを今回の範囲とし、push/merge/deployは今回の許可範囲外。

### 変更ファイル

- `src/core/dashboard-monitor-state.js`
- `src/worker/dashboard-monitor-home.js`
- `src/worker/runtime.js`
- `scripts/report-dashboard-monitor.mjs`
- `scripts/e2e-issue853-monitor-home.mjs`
- `test/dashboard-monitor-state.test.js`
- `test/dashboard-monitor-home.test.js`
- `test/dashboard-monitor-routes.test.js`
- `test/report-dashboard-monitor.test.js`
- `test/worker.test.js`
- `worker.js`（生成物）
- `docs/development-strategy/issue-853-notification-home.md`（既存作戦図に契約・検証結果を追記）

作業ログは `.local/issue-853/` に保存。共有用コードへログやローカルブラウザのプロファイルを含めない。


## review-fixes-001 対応（2026-09-24）

- `lastAttemptAt` は開始時刻、`lastSuccessAt` は成功完了時刻として独立に保持し、双方を `observedAt` 以下に制限。成功時刻が開始時刻を超える通常動作と、その後の失敗をテストした。
- 詳細の開閉状態は置換前のDOMから同期的に引き継ぎ、summary/actionのキーボードフォーカスを復元。5秒で最終成功が期限切れになる実際の再描画、30秒の更新、offlineを回帰テストした。通知内容が変わらない場合は履歴DOMを更新しない。
- offline/401時の件数は「現在の状態は未確認」を維持。初回取得失敗は通知欄にも取得不能を表示する。300秒は5分と表示し、自動予約行はbooleanを持つmonitorに限定する。
- 根拠付き完了は `documentedCompletion` として保持し、`reporterState` を別に返す。reporter引退・オフラインでも完了記録は残し、正常監視（healthy）には数えない。
- watch形式の `running/mode/checking/lastResult` を明示変換。`no_slots` だけを空きなしの確認とし、`needs_slot_review` は空き未確定の要確認とする。失敗・再試行はerror、`running:false` は停止を優先する。実状態ファイルは参照していない。
- PID照合は注入した合成ps応答で、bare Node・別プロセス・開始時刻不一致（PID再利用）・不在・EPERMをテストした。monitorのロックやプロセスを変更しない。資格情報は従来の環境変数経路を維持し、vault参照や送信は実行していない。
- 通知は `owner_action_required.changeSummary` を件名、`title` を本文へ対応させる。`dashboard_push_received` は表示対象から除く。元イベントおよびPushハンドラーは変更しない。
- D1 SQLテストは `node:sqlite` の実SQLiteアダプターを使用し、upsert・順序拒否・100件制限が成功。

### 最終検証

対象＋既存Workerは330件成功。全体を指定の `VTDD_VPS_LOCAL_HELPER_QUEUE_DIR=$PWD/.local/issue-853/test-queue` と `VTDD_VPS_LOCAL_HELPER_QUEUE_LOG=$PWD/.local/issue-853/test-helper.log` で1回再実行し、**1310件中1309成功、失敗0、skip1**。既存VPSテスト2件も作業領域内のログ設定で成功した。worker build、self-parity（35 routes / 35 operationIds）、generated worker検査も成功。ログは `.local/issue-853/review-full-test.log`。

ブラウザハーネスは実Worker・in-memory store・固定時計を使用し、mobile/desktop双方のlight/dark、5秒の鮮度変化と詳細・フォーカス保持、30秒poll、heartbeat期限、offline/401/503、初回認証失敗、console error、横はみ出しを検証するコードへ更新した。スクリーンショットには `DEMO · 合成データ / 本番ではありません` を明示し、`demo-review/` 以下へ出力する。この修正作業ではブラウザは起動せず、構文検査のみ。ハーネスのブラウザ実行、実機、実reporter、本番確認は未実施であり、実運用完了とは主張しない。
