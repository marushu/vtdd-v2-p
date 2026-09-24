# Issue #862 — DO alarm / existing thread resume 検証

この記録はローカルmapped integration E2Eである。実Apple・実Cloudflare alarm・実Macブラウザの5分E2Eではない。live SCは未達、Issueはcloseしない。

## 実装と検証の対応

| SC | 接続・検証 | live証拠 |
| --- | --- | --- |
| 1 約5分定期再開と重複防止 | authenticated registration→DO alarm→既存bridge handler→thread/read→同一thread/resume→turn/start。仮想時計を300秒ずつ進め、初回＋2自動再実行。run/claim/結果のdedupe、durable lease、期限切れの再送禁止 | 未実施 |
| 2 通常Chromeとfresh timeslots | runtime設定の対象照合、browser-use tool completed証拠、run開始後の取得時刻とApple timeslots URL、結果JSONを照合。旧表示/PID/no toolsは成功扱いしない | 実Chrome能力と実Apple取得は未実施 |
| 3 空きなし無通知・最早予約確定 | agent promptに事前承認/最早枠/同一profile/境界停止。no_slots再arm、confirmed＋日時で停止。予約確定は通常完了PWAイベント | 実予約未実施 |
| 4 本人認証と通知 | auth_requiredは具体操作をowner-actionへ。通常完了は別kind。停止/error/availableは一度要確認。過渡的未接続は無通知。outboxは同じid/tagでretryしブラウザを再実行しない | 実PWA受信ACK未実施 |
| 5 Butler操作 | /dashboard/browser-monitorとGET/POST API、通常チャットの「予約監視を停止して」「予約監視を再開して」「予約監視の状態」等（認識する定型表現の範囲内）。last fresh/next/inFlight/error、停止/再開を表示 | iPhone実画面未実施 |
| 6 2回以上自動再実行 | test/browser-thread-monitor.test.jsのmapped E2Eは実Worker route/DO/bridgeを通しCodexとAppleの応答だけfixture。2周期＋初回を確認 | deploy後の実5分×2周期は未実施 |

## 検証コマンド

```sh
node --test test/browser-thread-monitor.test.js test/browser-monitor-notification.test.js test/active-issue-execution-queue.test.js test/dashboard-app-server-bridge.test.js test/executor-runtime-fence.test.js test/dashboard-monitor-state.test.js test/dashboard-monitor-home.test.js test/dashboard-monitor-routes.test.js
npm run build:worker
npm test
git diff --check
```

PRのVerification Evidenceに最終コマンド結果を記載する。初回full suiteは古い#858 Now期待値1件が失敗した。ownerの明示指示どおり#862 ROOT/Nowと#858 Nextの両方を検証する期待値へ更新した。テスト削除・assert緩和はしていない。

通知テストは既存暗号化Web Push/event経路を使い、synthetic購読・生成したテスト鍵とmock HTTP transportで検証する。実pushや実credential変更は行わない。通常完了/owner-actionを区別し、本文に店舗・予約日時・確定が残ること、不要な予約番号等をコピーしないこと、送信失敗後のretry、persisted sentとduplicate resultのdedupeを確認する。

## 本番GO後の手順・境界

1. scoped merge/deploy GOの後にWorkerと既存Mac bridgeのこのPR版を反映する（本作業では未実施）。
2. #858/#860の既存Mac PRIMARY/世代/署名済みadmissionとbridge接続を確認する。未初期化・credential・permissionの変更が必要なら個別passkey境界で止める。
3. 既存ログイン済みChromeの対象profileとCodex threadにbrowser-use能力があることを確認し、opaque thread/bridge room/対象をruntime APIまたは管理UIで登録する。repoには値を書かない。
4. Run now→実fresh timeslots→2回以上の約5分自動再開を確認する。fixture結果をこの証拠の代用にしない。
5. 結果不明のleaseは自動で解放しない。既存予約を確認できない状態で再予約しない。stopは進行中の外部予約を取り消さない。

現時点の分類はincomplete / live evidence gap。merge/deploy・既存誤watcher・Chrome profile・Cookieは変更しない。
