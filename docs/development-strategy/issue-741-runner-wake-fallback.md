# Issue #741: runner wake primary / timer fallback

## 完了体験

Dashboard Butler / passkey operator が VPS helper queue を作った直後、connected
app-server bridge が VPS local queue へ保存し、同じ turn で
`systemctl --user start vtdd-vps-runner.service` を即時実行する。owner-facing
runtime truth は「即時 wake が主経路」「timer は未使用の fallback」または
「即時 wake 失敗、timer fallback 待ち」を明示する。

## VTDD 全体で進める部分

Issue #741 の継続 slice として、PR #827 で接続した VPS local queue/state/log
handoff の次に、runner pickup の主経路を 1 分 timer ではなく app-server
bridge 経由の即時 wake に寄せる。Issue #816 / #814 / #811 は active のまま
だが、この ROOT safety slice が終わるまで再開しない。

## 設計

- `executeVpsRunnerWakeup` は fixed user systemd command だけを実行する。
- 成功時は `primary: systemd_service_start`、`fallbackUsed: false`、
  `fallbackRole: recovery_only` を返す。
- 失敗時または bridge 未接続時だけ `fallbackUsed: true` として
  `vtdd-vps-runner.timer` を recovery fallback と表示する。
- Worker / DashboardChatRoom の `/runner-wakeup` と
  `/app-server-control` 結果表示も同じ語彙に寄せる。
- timer interval 自体はこの PR では変更しない。実機 systemd mutation は
  passkey/VPS maintenance 境界であり、この PR は runtime truth と主経路の
  証明を強化する。

## 仮説

既存コードは wakeup command を実行しているが、レスポンスが常に
`fallback: vtdd-vps-runner.timer` を含むため、owner-facing には timer が主経路
のように見える。`scripts/run-dashboard-app-server-bridge.mjs` と
`src/worker/runtime.js` の result normalization / message builder を直せば、
local queue enqueue 直後の即時 wake が主経路であることを runtime truth と
テストで固定できる。

## 検証計画

- Unit: `test/dashboard-app-server-bridge.test.js` で systemd start 成功時に
  `fallbackUsed=false`、失敗時に `fallbackUsed=true` を確認する。
- Unit: `test/worker.test.js` で DashboardChatRoom の wakeup request と
  helper queue result message が primary/fallback を区別することを確認する。
- Build: `npm run build:worker` で generated worker を更新する。
- Test: 関連 test を通し、必要なら `npm test` を実行する。
- Runtime: PR 後の deploy は別途 passkey approval が必要。PR 内では live
  VPS systemd unit を変更しない。

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`: runner wakeup result の truth
  fields を追加。risk は既存 Issue #717 `vps_runner` wakeup response の互換性。
- `src/worker/runtime.js`: `/runner-wakeup` と result formatter の primary /
  fallback 表示を追加。risk は owner-facing message が冗長になること。
- `test/dashboard-app-server-bridge.test.js`: bridge wake result assertions 追加。
- `test/worker.test.js`: Worker / DashboardChatRoom wakeup assertions 追加。
- `docs/butler/remote-codex-cli-executor.md`: timer を recovery fallback と明記。
- `docs/mvp/active-issue-execution-queue.md`: Now の #741 継続内容を更新。

## 既に通っている経路

- PR #826 で GitHub Issue comment helper queue creation を停止した。
- PR #827 で VPS local queue/state/log handoff と runner local pickup を追加した。
- production VPS では `vtdd-dashboard-app-server-bridge-unresolved.service` が
  active running で、`/home/vtdd-runner/vtdd-runner/run/vps-helper-queue` が存在する。

## 未確認の境界

- deploy 後の production runtime で helper queue job を実投入して即時 wake
  result を観測する E2E は、この PR merge 後の deploy/passkey approval が必要。
- `vtdd-vps-runner.timer` の interval 変更は operator runtime mutation なので、
  この PR では実行しない。

## 穴が出そうな箇所

- `fallback` field を消すと既存 caller が壊れる可能性があるため保持しつつ
  `fallbackUsed` / `fallbackRole` を追加する。
- bridge 未接続時は Worker が保存しないため、fallback timer だけでは拾えない。
  その場合は `vps_local_helper_queue_unavailable` の blocked status が正しい。
- queue 保存後に wake 失敗した場合は local queue が残るため、timer fallback
  で拾える。ここだけ fallback を owner-facing に表示する。

## PR 前に確認すること

- PR #827 が merged であること。
- 新規 branch が `origin/main` から作られていること。
- Issue #741 が open で、この slice が Success Criteria の bridge lifecycle /
  owner-facing runtime truth に対応していること。

## 実装候補と捨てた案

- 採用: wake result の truth fields を強化し、timer を recovery-only と明記する。
- 捨てた案: timer を即座に 5 分へ変更する。これは実機運用 mutation を伴い、
  wake 主経路の信頼性を証明する前に fallback を弱める。
- 捨てた案: Worker に queue を保存させる。PR #826/#827 の設計に反し、
  store-and-forward を Worker 側に戻す。

## merge 後に通す E2E

- deploy passkey approval 後、production deploy を走らせる。
- Dashboard Butler から VPS helper queue が必要な bounded action を投げ、
  Dashboard result で `fallbackUsed=false` を確認する。
- VPS で `journalctl --user -u vtdd-vps-runner.service` と
  `vps-helper-queue.log` を確認し、queue 保存直後に runner が起動したことを
  記録する。

## 次の PR を増やさない理由

この slice は PR #827 の handoff 接続に直接続く runtime truth 補強であり、
別 PR に分けると「local queue はできたが、pickup 主経路が timer なのか wake
なのか」が owner-facing に曖昧なまま残る。

## 停止条件

- Issue #741 と無関係な runner polling interval 変更、credential mutation、
  deploy、systemd unit live mutation が必要になった場合は停止する。
- bridge 未接続時に Worker 側 store-and-forward を入れたくなった場合は停止する。
- tests が既存 Issue #717 `vps_runner` wakeup 互換性を壊す場合は停止して範囲を
  再確認する。
