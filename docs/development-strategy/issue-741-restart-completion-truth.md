# Issue #741 restart completion truth 作戦図

## 完了体験

Owner が deploy 後 bridge restart を承認したあと、Dashboard Butler は「script を起動しました」だけで止まらず、同じ Dashboard thread に completion truth を返す。最低限、VPS local helper queue に enqueue されたこと、runner wake が試行されたこと、runner が local pending を pickup したこと、restart helper が `synced_and_restarted` / `blocked_*` / `failed` のどれで終わったか、before/after の service state と git SHA を owner-facing に分けて表示できる。

## VTDD 全体で進める部分

Issue #741 の継続 slice として、deploy 後 bridge restart の完了 truth だけを固める。Issue #637 の privileged maintenance boundary と Issue #413 の runtime truth をまたぐが、root/helper 実行の authority model は変えない。Worker は root/helper execution を開始しない。GitHub Issue comment helper queue は復活させない。

## 設計

現在の main は PR #826 で GitHub Issue comment helper queue を停止し、PR #827 / #828 で VPS local helper queue と runner wake を主経路にしている。ただし owner が観測した通り、起動結果と restart 完了結果が混ざると「再起動したのか」が判断できない。今回の設計は、local queue lifecycle と helper result の表現を短く正規化し、completion/failure を Dashboard に戻すための不足を埋める。

Dashboard / Worker 側では `queued` / `wakeup started` を completion と呼ばない。VPS runner 側では local helper queue の `running` / `completed` / `failed` state を必ず更新し、helper script の JSON `runtimeTruth` を state/log に残す。Bridge restart helper script 側では `systemctl restart` 後の service state が before と同じままなら `restart_unverified` として失敗寄りに扱い、単なる exit code 0 を完了扱いしない。

## 仮説

`scripts/sync-dashboard-app-server-bridge-after-deploy.mjs` は `systemctl --user restart` の exit code と after service state を返すが、PID / ActiveEnterTimestamp の変化を completion condition として要求していない。そのため service restart が no-op に見える場合でも `synced_and_restarted` になり得る。また bridge self-launch path は detached log に書くだけなので、Dashboard に completion truth を戻せない。local helper queue path では runner が completion state を書けるため、ここを owner-facing truth の主経路にするのが正しい。

## 検証計画

- Unit: `sync-dashboard-app-server-bridge-after-deploy` が before/after MainPID または ActiveEnterTimestamp の変化を検証し、変化しない場合は `restart_unverified` を返す。
- Unit: 同 helper が `synced_and_restarted` の時に before/after service state、PID、ActiveEnterTimestamp、git SHA、target ref match を runtimeTruth に含める。
- Unit: VPS local helper queue completion state が helper result の status/runtimeTruth を state file に残す。
- Unit: Dashboard app-server bridge の enqueue result は `queued` / `wakeup` を restart completion と混同しない owner-facing fields を持つ。
- Local: `node --test test/sync-dashboard-app-server-bridge-after-deploy.test.js test/dashboard-app-server-bridge.test.js test/vps-runner-script.test.js --test-name-pattern "bridge|restart|local helper|wakeup|deploy"`
- Local: `npm run check:generated-worker`。worker source を触る場合は `npm run build:worker` と `npm run verify:worker`。

## 改修見積もり

- `scripts/sync-dashboard-app-server-bridge-after-deploy.mjs`: restart after state verification を追加する。risk は systemd が PID を再利用または timestamp format を返さない環境で false negative になること。
- `test/sync-dashboard-app-server-bridge-after-deploy.test.js`: success / restart_unverified / dirty checkout の回帰を追加する。risk は fake runner が現実の `systemctl show` とずれること。
- `scripts/vps-local-helper-queue.mjs`: completion state が result summary を落とさないか確認し、必要なら summarize を拡張する。risk は state file に長い stdout を保存しすぎること。
- `test/dashboard-app-server-bridge.test.js` または `test/vps-runner-script.test.js`: enqueue/wakeup と completion の用語境界を固定する。risk は既存 owner-facing text の期待値と衝突すること。

## 既に通っている経路

- deploy event から Worker へ通知される。
- Worker は GitHub Issue comment helper queue を作らない安全 slice を持つ。
- Dashboard app-server bridge は VPS local helper queue へ enqueue できる。
- enqueue 後に `systemctl --user start vtdd-vps-runner.service` wake を試行できる。
- helper script は git sync と `systemctl --user restart vtdd-dashboard-app-server-bridge-unresolved.service` を実行できる。

## 未確認の境界

- production VPS runner が local pending を pickup したあと、Dashboard event endpoint へ completion を安定送信できるか。
- bridge restart 中に同じ bridge WebSocket が落ちた場合、completion event が再接続後にどの thread へ戻るか。
- heartbeat file を completion condition に含めるべきかは、現在の helper script 単体では未接続。

## 穴が出そうな箇所

- `systemctl restart` exit code 0 だけで完了扱いすること。
- detached bridge self-restart log を Dashboard completion と誤解すること。
- local queue state に result を残しても、Dashboard へ届ける event がないこと。
- GitHub Issue comment queue を復活させること。
- restart guard を強くしすぎて正常 restart も `unverified` にすること。

## PR 前に確認すること

- #741 は現在 Now で、#816 / #814 は active のまま downscope しない。
- root/helper execution, deploy, credential, permission mutation はこの PR で実行しない。
- production restart E2E は merge/deploy/passkey 後の外部 evidence であり、この PR の local completion とは分ける。

## 実装候補と捨てた案

採用: helper script の completion condition を強め、local queue/result state に owner-facing completion fields を残す。

採用: enqueue/wakeup result の文言を launch truth と completion truth に分離する。

捨てた案: GitHub Issue comment queue を再利用して completion を見せる。PR #826 の安全 slice に反する。

捨てた案: Worker が root/helper execution を直接開始する。authority boundary に反する。

捨てた案: bridge self-restart detached child から completion callback を実装する。self restart 中の connection loss と retry/duplicate guard が広がり、この slice の範囲を超える。

## merge 後に通す E2E

production deploy 後、Dashboard Butler から deploy bridge restart を一回だけ承認し、VPS local helper queue state が `completed` または `failed` に遷移し、Dashboard thread が `script started` ではなく terminal truth を表示することを確認する。成功時は before/after PID または ActiveEnterTimestamp の変化、after git SHA と origin/main SHA の一致を evidence とする。

## 次の PR を増やさない理由

今回の変更は completion 判定と owner-facing truth の不足を同じ failure mode として扱う。helper script だけを直すと Dashboard はまだ launch truth で止まり、Dashboard text だけを直すと helper が no-op restart を成功扱いし続けるため、同じ PR で最低限接続する。

## 停止条件

- restart 完了 after state を検証するには privileged live service 操作が必須で、local/unit で意味のある検証ができない場合。
- local helper queue から Dashboard completion event へ戻すには新しい credential または permission mutation が必要と判明した場合。
- restart 中の active turn を壊すリスクが実装中に具体化した場合。
