# Issue #741 ephemeral bridge restart strategy

## 完了体験

deploy 成功後、Dashboard Butler は app-server bridge restart を GitHub Issue comment queue として残さない。接続中の repo-less app-server bridge に一回限りの runtime control message を送り、bridge 側が VPS local で checkout sync と user systemd restart を実行する。owner は Dashboard chat で「restart request を送った / bridge が再起動後に再接続した / 失敗した場合は同じ thread で復旧可能」を見る。GitHub Issue #741 には deploy ごとの未処理 queue comment が増えない。

## VTDD 全体で進める部分

Issue #741 の deploy 後 bridge lifecycle と Issue #637 の VPS recovery plane のうち、deploy standard post-step の transport を修正する。GitHub Issue comment は人間とPR証跡の場所であり、短命の operational queue に使わない。VPS local log と systemd journal を実行証跡の主にし、GitHub にはPR/E2Eで要約 evidence だけを残す。

## 設計

deploy success event を Worker が受けたら、既存の deploy approval grant は引き続き検証する。ただし `createVpsPrivilegedMaintenanceHelperExecutionQueue()` で Issue comment を作らない。代わりに DashboardChatRoom の app-server bridge WebSocket に、`bridge_control` 系の one-shot request を送る。payload は固定 command class `dashboard_bridge_unresolved_deploy_sync_restart`、target ref `origin/main`、service `vtdd-dashboard-app-server-bridge-unresolved.service`、deploy run id、head sha、thread id だけに限定する。

bridge process は control message を受けたら、`scripts/sync-dashboard-app-server-bridge-after-deploy.mjs` を child process として detached に起動する。restart command は最後に自分自身の user service を restart するため、親 bridge は control ack を Worker に返してから detached child を起動する。child stdout/stderr は VPS local log file に append し、systemd journal には service restart before/after が残る。GitHub Issue comment には queue/comment/event を書かない。

bridge が未接続なら Worker は `bridge_control_not_connected` を chat runtime truth として返し、古い queue を作らない。これは「後で溜まった queue をまとめて実行」より安全で、owner-facing には retry/recovery が必要と明示する。

## 仮説

今回の破綻は pagination bug だけではない。GitHub Issue comment を deploy restart の queue にしたため、未処理 queue が GitHub に永続化され、後から selector を直すと古い restart がまとめて実行される危険が生まれた。deploy 後 bridge restart は最新 deploy に対する一回限りの運用制御であり、durable GitHub queue にする設計自体が不適切だった。

既存 Worker は DashboardChatRoom から app-server bridge へ owner turn を送れる。bridge script は user systemd `vtdd-vps-runner.service` wakeup も扱っているため、同じ WebSocket control lane で fixed restart request を受ける実装が最小変更になる。

## 検証計画

- Unit: deploy success follow-up が GitHub Issue comment queue を作らず、bridge control request を送ること。
- Unit: bridge 未接続時は queue comment を作らず blocked runtime truth を返すこと。
- Unit: bridge script が deploy restart control request を fixed script argv に変換し、任意 command を受け付けないこと。
- Unit: bridge script の restart child は detached で起動し、stdout/stderr log path を VPS local path に限定すること。
- Unit: VPS runner の既存 privileged maintenance queue は維持するが、deploy bridge follow-up は runner queue selector の対象にしないこと。
- Local: `node --test test/dashboard-app-server-bridge.test.js test/worker.test.js --test-name-pattern "deploy|bridge control|app-server bridge"`
- Local: `node --test test/sync-dashboard-app-server-bridge-after-deploy.test.js test/vps-runner-script.test.js`
- Worker source を触るため `npm run build:worker` と `npm run verify:worker` を実行する。

## 改修見積もり

- `src/worker/runtime.js`: deploy bridge follow-up を Issue comment queue から WebSocket control request へ変更する。risk は bridge disconnected 時の owner-facing blocker が弱いと silent failure に見えること。
- `scripts/run-dashboard-app-server-bridge.mjs`: `deploy_bridge_sync_restart_requested` control message を受け、fixed script を detached 起動する。risk は self-restart の前に ack を返せないと Dashboard から見えないこと。
- `test/worker.test.js`: deploy event が queue comment を作らず bridge control を送ること、未接続なら blocked になることを固定する。
- `test/dashboard-app-server-bridge.test.js`: bridge control request の command allowlist と local log path を固定する。
- `worker.js`: generated worker。`src/worker/runtime.js` 変更後に更新する。

## 既に通っている経路

- GitHub Actions deploy success event は Worker `/v2/events/github-actions` に届き、Dashboard chat event にできる。
- DashboardChatRoom は app-server bridge WebSocket 接続状態を知り、owner turn request を bridge へ送れる。
- `scripts/sync-dashboard-app-server-bridge-after-deploy.mjs` は fixed service/ref だけを許可し、tracked dirty checkout なら restart 前に止める。
- VPS user service は `systemctl --user restart vtdd-dashboard-app-server-bridge-unresolved.service` で再起動できる。

## 未確認の境界

bridge が restart control ack 後にすぐ切断するため、after state を同じ WebSocket で返すことは保証しない。after truth は再接続 event、systemd journal、VPS local log で確認する。今回は GitHub Issue comment へ after event を書かない方針を優先する。

Cloudflare Worker から VPS へ直接 HTTP/SSH する経路は作らない。bridge が未接続の時は「実行できない」と返し、古い restart request を durable に積まない。

## 穴が出そうな箇所

- one-shot request が bridge disconnect で失われると restart されない。ただし stale queue 蓄積より安全で、owner-facing blocker として出す。
- detached child の log が無制限に増えると別の蓄積問題になる。初期実装では append先を固定し、後続で logrotate/tmpfiles 設定を Issue #741 の lifecycle guard に入れる。
- deploy success event 重複受信で複数 restart request が飛ぶ可能性がある。既存 event/message dedupe を維持し、run id 単位で二重送信しない。
- app-server bridge 自身を restart するため、進行中 turn は切れる可能性がある。pending owner message は DashboardChatRoom 側の保存済み queue から復帰する前提を守る。

## PR 前に確認すること

- GitHub Issue #741 に deploy ごとの queue comment を作らないこと。
- GitHub Issue #741 の既存未処理 queue をこの PR でまとめて実行しないこと。
- owner-specific runtime URL や credential を public repo に固定しないこと。
- Worker generated file と source が一致すること。
- PR body に `Execution Queue Delta` と `vps_handoff_gap_found` / `recovery_gap_found` の解消範囲を明記すること。

## PR #823 review blocker 対応

codex fallback reviewer は `/app-server-control` が汎用制御面になっていることと、一回限り restart の冪等性がないことを merge blocker とした。これは妥当で、このままでは「fixed command のみ」「一回限り」という authority boundary が実装で保証されない。

追加 bounded change contract:

- target Issue: Issue #741 / Issue #637。
- exact Success Criteria: `/app-server-control` は deploy bridge restart 専用 payload だけを受ける。DO 側で type / commandClass / service / ref / repository / deployRunId を再検証する。DO 側と bridge 側の両方で request/deployRun 単位の重複実行を拒否する。
- Non-goals: live E2E、Action Schema 追加、GitHub secret/permission mutation、既存 Issue comment cleanup、VPS logrotate/tmpfiles 設定。
- files expected to change: `src/worker/runtime.js`, `scripts/run-dashboard-app-server-bridge.mjs`, `test/worker.test.js`, `test/dashboard-app-server-bridge.test.js`, `worker.js`, this strategy file。
- validation: focused worker tests, bridge control tests, `npm run build:worker`, `npm run verify:worker`。
- stop condition: 汎用 message forwarding を残さないと実装できない、または queue/storage として restart request 本文を永続化しないと冪等性を担保できない場合は停止する。

DO 側の idempotency marker は queue ではなく replay guard として TTL 付き最小 metadata に限定する。保存するのは request body ではなく request/deployRun の key、status、timestamp 程度で、stale execution を後で実行する材料にはしない。

## PR #823 reviewer blocker 第2ラウンド対応

fallback reviewer は、Worker が WebSocket 送信成功を `sent` と報告するだけで、bridge 側の `started` / `blocked` / `duplicate` / `failed` result を Dashboard/Worker に戻していない点を merge blocker とした。また、DO claim を送信時に確定すると、bridge spawn failure でも同じ deployRunId が 24h retry 不能になる点も blocker とした。これも妥当。

追加 bounded change contract:

- target Issue: Issue #741 / Issue #637。
- exact Success Criteria: bridge の `deploy_bridge_sync_restart_result` を Worker/DO が受け取り、Dashboard thread に runtime truth として append する。`failed` result では DO claim を release し、同じ deployRunId の retry を可能にする。`started` と `duplicate` は replay guard として claim を維持する。
- Non-goals: detached child が systemd restart 完了後に同じ WebSocket へ before/after state を返すこと、live E2E、logrotate/tmpfiles、Action Schema 追加。
- files expected to change: `src/worker/runtime.js`, `test/worker.test.js`, `worker.js`, this strategy file。
- validation: focused DO app-server control/result tests、bridge restart control tests、`npm run build:worker`、`npm run verify:worker`。
- stop condition: restart 完了後の before/after state を同じ PR で保証するには bridge self-restart script の protocol 変更が必要になる場合。この PR では local log/systemd journal evidence と Dashboard result message までに限定し、live before/after は merge 後 E2E として残す。

## 実装候補と捨てた案

採用: deploy success event から接続中 bridge へ one-shot WebSocket control request を送る。

採用: bridge process が fixed script を detached 起動し、VPS local log と systemd journal に証跡を残す。

捨てた案: runner の Issue comment pagination だけを直す。古い queue を後から拾う危険と GitHub comment 蓄積問題を残す。

捨てた案: GitHub Issue comment を作成後に delete/update する。GitHub を短命 queue store として使い続けるため不採用。

捨てた案: GitHub Actions から VPS SSH restart する。VPS credential を Actions に広げるため不採用。

捨てた案: Cloudflare Worker から任意 VPS endpoint を叩く。VPS inbound API と認証面が未設計で、今回の最小 slice を超える。

## merge 後に通す E2E

1. deploy-production を実行する。
2. Issue #741 のコメント数が deploy bridge queue で増えないことを確認する。
3. Dashboard chat に deploy success と bridge restart request sent / blocked のどちらかが出ることを確認する。
4. bridge connected 状態では VPS `ActiveEnterTimestamp` と MainPID が deploy 後に変わることを確認する。
5. VPS local bridge restart log が肥大化しないよう、logrotate/tmpfiles follow-up を確認する。

## 次の PR を増やさない理由

この修正は pagination と cleanup の小手先ではなく、deploy restart transport の根を変える必要がある。Worker と bridge script の両端を同じ PR で変えないと、queue 作成停止だけで restart 不能になるか、bridge 側 receiver だけが未使用で残る。

## 停止条件

- bridge WebSocket control lane が存在せず、Worker から一回限り restart request を送れないことが判明した場合。
- restart に root credential、permission mutation、GitHub secret mutation が必要になった場合。
- fixed argv 以外の任意 command を許す必要が出た場合。
- GitHub Issue comment queue を残さないと restart できない設計しか取れない場合。
