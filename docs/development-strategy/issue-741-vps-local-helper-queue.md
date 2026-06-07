# Issue #741 VPS local helper queue / bridge restart strategy

## 完了体験

Dashboard Butler から scoped passkey / deploy approval 済みの bridge restart
または VPS privileged maintenance request を投げた時、GitHub Issue comment
を作らず、接続中 app-server bridge が VPS local queue に一回だけ保存する。
VPS runner は local queue を先に拾い、root-owned helper へ渡し、state と
log を VPS 上に残す。Dashboard には「queue に入った / 起動した / 完了 /
失敗 / 未接続で blocked」が runtime truth として返る。

## VTDD 全体で進める部分

- Issue #741 の root blocker 継続。
- PR #826 で止めた GitHub Issue comment queue の代替 transport を実装する。
- Issue #637 の privileged maintenance path に必要な local handoff surface を
  repo-backed にする。
- Issue #413 の runtime truth は local log/state を evidence source にする。

## 設計

Worker は VPS filesystem に直接書けないため、保存点は接続中
app-server bridge に限定する。Worker の queue endpoint は
`DASHBOARD_CHAT_ROOMS` の app-server control を呼び、control payload を
bridge socket へ送る。bridge は unprivileged user として local queue/state/log
へ append/write し、必要なら `vtdd-vps-runner.service` wakeup を試す。
runner は起動時に VPS local pending queue を GitHub Issue comments より前に
読んで、pending -> running -> completed/failed へ移す。

未接続の場合、Worker は保存先がないため blocked とする。これは正常系では
なく、Issue #741 / self-healing watchdog の復旧対象である。

## 仮説

- `src/worker/runtime.js` の `/app-server-control` は deploy bridge restart 専用
  validation なので、local helper queue 用の固定 message type を追加する。
- `createVpsPrivilegedMaintenanceHelperExecutionQueue` は現在 503 を返している。
  ここを `DASHBOARD_CHAT_ROOMS` 経由の local queue handoff に変える。
- `scripts/run-dashboard-app-server-bridge.mjs` は WebSocket control を受けられる
  ので、enqueue message を処理して local queue に保存できる。
- `scripts/run-vps-runner.mjs` は Issue comment pickup が先なので、local queue
  consumer を先に入れないと旧経路依存が残る。
- 狭く Worker だけを直すと、VPS に保存されず Butler Completion Gate がまた
  unconnected になる。

## 検証計画

- Unit: Worker queue endpoint が GitHub API を呼ばず、bridge control を送る。
- Unit: bridge が helper queue enqueue request を local pending/state/log に
  保存し、wakeup result を返す。
- Unit: runner が local pending queue を先に拾い、helper 実行後に completed /
  failed state に移す。
- Integration: deploy bridge restart control は既存挙動を維持する。
- Generated worker: `npm run build:worker`。
- Full local: `npm test`。

## 改修見積もり

- `src/worker/runtime.js`: app-server control validation / routing、helper queue
  endpoint の local queue control 化。risk は Durable Object socket 未接続時の
  blocked 表現。
- `scripts/vps-local-helper-queue.mjs`: local queue/state/log の作成、claim、
  complete/fail、retention prune。risk は file lock の競合。
- `scripts/run-dashboard-app-server-bridge.mjs`: enqueue control の受信と local
  queue 書き込み、runner wakeup。risk は detached restart control との混同。
- `scripts/run-vps-runner.mjs`: local queue consumer を先頭に追加。risk は旧
  Issue comment queue との互換順序。
- `test/worker.test.js` / `test/dashboard-app-server-bridge.test.js` /
  `test/vps-runner-script.test.js`: transport / local state / no GitHub write を検証。
- `worker.js`: generated artifact。
- `docs/mvp/active-issue-execution-queue.md`: Now の delta を更新。

## 既に通っている経路

- PR #826 で Worker は GitHub Issue comment queue を作らなくなった。
- deploy 後 bridge restart は app-server bridge control へ一回限りで送る経路が
  既にある。
- bridge は `deploy_bridge_sync_restart_requested` を受け、VPS local log へ
  起動証跡を残せる。
- root-owned helper は `sudo -n /usr/local/sbin/vtdd-vps-maintenance-helper
  --execute --input <file>` の固定 invocation を持つ。

## 未確認の境界

- live VPS の systemd service がこの PR 後の runner script をいつ読むかは
  deploy / restart approval 後の runtime truth で確認する。
- disconnected bridge の完全自律復旧は PR #824 watchdog と運用 install 側の
  evidence が必要で、この PR 単体では live install しない。
- Dashboard への helper 完了 postback は local state/log evidence を先に通し、
  owner-facing final report の拡張は必要なら次 PR に分ける。

## 穴が出そうな箇所

- local queue enqueue が毎分 poll log を残すと、Issue comment queue と同じ
  蓄積問題になる。poll miss はログ化しない。
- duplicate request を二重実行しない idempotency が必要。
- runner が local pending と旧 Issue comment queue の両方を拾うと同じ request
  が重複する可能性がある。local queue を先に拾い、state で claim する。
- bridge 未接続時に Worker 側へ一時保存すると「どこにも保存しない」方針に
  反するため、未接続は blocked にする。

## PR 前に確認すること

- GitHub Issue comment 作成 API が helper queue endpoint から呼ばれないこと。
- queue/state/log path が `$HOME/vtdd-runner/run/vps-helper-queue` と
  `$HOME/vtdd-runner/logs/vps-helper-queue.log` に限定されること。
- log retention / state cleanup が設定され、空 poll を記録しないこと。
- deploy bridge restart 既存 tests が壊れていないこと。

## 実装候補と捨てた案

- 採用: Worker -> connected bridge control -> VPS local queue -> runner pickup。
- 捨てた案: Worker KV/D1 に queue を保存して VPS が pull する。VPS local 以外に
  保存が残るため user の方針に反する。
- 捨てた案: Issue comment pagination を直して延命する。コメント蓄積の根本原因を
  残す。
- 捨てた案: bridge が root helper を直接 sudo 実行する。既存 runner/helper
  boundary を迂回し、authority evidence が分散する。

## merge 後に通す E2E

- deploy 後に bridge control が `queueCommentPosted=false` のまま local queue/log
  evidence を返す。
- Butler から passkey approval 後に helper queue enqueue が `queued` を返す。
- VPS runner が pending local queue を拾い、state が completed または failed に
  変わる。
- bridge restart 後も Dashboard main thread の pending owner messages が失われ
  ない。

## 次の PR を増やさない理由

Issue comment queue を止めた後、local queue producer と consumer を別 PR に
分けると Butler からの handoff がまた blocked のまま残る。今回の PR は
producer/control/consumer/local evidence の最小閉路だけを入れ、live deploy /
watchdog install / Issue close は別 authority 境界に残す。

## 停止条件

- Worker が VPS local 以外に helper execution envelope を永続化する必要が出た時。
- bridge 未接続時の store-and-forward を入れたくなった時。
- root helper の sudoers / capability manifest を変更する必要が出た時。
- deploy、credential、permission、systemd live mutation が必要になった時。
