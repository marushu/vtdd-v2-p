# Issue #862: DO alarmから既存ブラウザスレッドを定期再開する

Planning tier: root。ROOT / Now。基準main: eedbc76。全6 SCを維持する。

## 完了体験・設計

Dashboard Butlerで監視を登録し、約5分ごとにCloudflare DashboardChatRoomのalarmが既存Mac bridgeへapp_server_turn_requestedを送る。Codexの既存opaque threadをresumeし通常Chromeの指定profileでfresh timeslotsを取得する。no_slotsは無通知、最早枠は事前承認の範囲で確定、confirmedで停止。予約確定は既存event/pushの通常完了通知、本人認証と要確認の監視停止は既存owner-action/PWA経路。停止・再開・最終実取得・次回・失敗をDashboardで確認する。

native desktop scheduler依存の診断案を撤回する。既存DO bindingを使い、schedulerは単一のdashboard-app-server-bridge roomに永続化する。target bridge roomはruntime入力。対象/profile/device/thread ID/予約事前承認はruntime stateでありrepoにowner値を埋め込まない。既存#858/#860 admissionを送信前とMac実行直前に再利用する。VPSや旧generationは実行不可。

alarmはat-least-once。永続inFlight/runId/claimを外部送信より前に保存する。claimは一度だけ。送信後の応答不明・timeout・bridge切断ではleaseを自動解放せずerrorとして停止、勝手に予約を重ねない。停止は次回dispatchを止めるが既に始まった外部予約を取り消せない。inFlightが残る間は再開/設定変更不可。terminal resultだけがleaseを解放する。機械可読結果をrun/thread/generation/対象/取得時刻と照合する。tool利用の証拠も必要とし、PIDや任意の文章を成功としない。

## 仮説・既存経路

runtime.jsのDashboardChatRoomはstorageとbridge socketを持つ。bridge handleDashboardTurnRequestはthread/resume→turn/startを実装済み。executor admissionも実装済み。DO alarm追加は新binding/migration不要。接続先bridgeが対象MacのCodex履歴とbrowser-useツールへアクセスできることはlive smokeで別途検証が必要。既存native MCPを偽装/迂回しない。

## 検証計画

Scoped tests: 5分alarmを2周期進める、再起動したDO state復元、重複alarm/claim/結果、古いgeneration/VPS、未接続、結果不明、停止中late result、freshness/対象照合、不正JSON、no_slots/一時未接続は無通知、auth/terminal error/available停止はaction_required、completedは通常完了push、通知失敗のoutbox retry、duplicate結果のdedupe、completed停止。既存bridge fake app-serverを通すmapped integration E2Eと実Apple E2Eを区別する。scoped→生成→full suite一回→PR。

## 変更箇所・見積もり

- src/core/browser-thread-monitor.js: 入力/結果/prompt/状態機械
- src/worker/browser-thread-monitor.js: DO alarm・claim・result・snapshot
- src/worker/runtime.js: DO/認証済みroute/既存通知接続
- scripts/run-dashboard-app-server-bridge.mjs, scripts/executor-runtime-fence.mjs: monitor実行/identity/fallback禁止
- Dashboard監視管理画面: 登録・停止・再開・fresh/next/error。既存Butler chatにも操作経路
- test/browser-thread-monitor*.test.js: mapped E2E・境界
- worker.js等生成物、queue、E2E記録

## Non-goals・公開境界

独自browser、Puppeteer/Playwright監視器、Mac cron/LaunchAgent、Cookieコピー、既存誤watcherの変更は禁止。archived wizard・credential・permissionには触れない。対象値はruntimeのみ、公開coreで再利用可能にする。CAPTCHA/新規credential/法的同意は止める。一般errorを本人認証通知に偽装しない。

## 穴・PR前確認・停止条件

Workerとbridgeの両方に新コードが必要。merge/deploy/bridge更新・設定/本人性登録は実施しない。UIとAPIに認証、同一origin、入力上限を適用。予約処理の完全なexactly-onceや侵害済みノード対策とは主張しない。通常chatとmonitorを同時利用しないためactive turnを確認し、予約不明はfail closed。PRはholdでmergeを防ぐ。

## merge後のE2E・次PRを増やさない理由

このPRでtimerから結果・owner操作までを接続し、診断だけで切り出さない。承認済みdeploy後、runtime設定→Run now→実timeslots→約5分後の自動run→二回以上の自動run→停止/再開/auth境界を実確認する。fixture結果は本番SC6達成と数えない。現在の目的はPRまでであり今夜の稼働はdeploy GOとlive E2Eが残る。

threadLocalAssumptionsPromoted: この作戦図・queue・E2E記録をcommit/push/PRで共有する。RAGは未保存。

## 通知と品質ゲート（owner追加指示）

通常完了通知は店舗と確定日時（日本時間）だけを構造化結果から組み立て、agentの自由文・予約番号・メールをpush本文へコピーしない。runIdと種類をdedupe keyにしてoutboxへ保存する。既存event storeのsent記録も照合し、同一tagはrenotify=false。Web Pushと保存の間のクラッシュについて分散系全体のexactly-onceを保証するものではない。通知失敗はalarmで再試行し、停止済みブラウザrunを再実行しない。stateと次のalarmをDO storage transactionで一括保存する。

readJson(request)はrequest.json()のみでContent-Typeの強制はない。ただし内部owner-action Requestもapplication/jsonを明示し、実既存push helperを通すテストを置く。

#862 ROOT/Now・#858 Nextをqueueテストで明示検証する。scoped tests→build worker→最終full npm test（fail=0）→git diff --checkの後にだけready PRをhold付きで作る。IssueはClosesにせず、checks開始確認で止める。
