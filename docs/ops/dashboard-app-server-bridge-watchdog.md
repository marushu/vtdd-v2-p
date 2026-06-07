# Dashboard app-server bridge watchdog

Issue #741 の bridge self-healing 用 VPS user systemd 構成。

## 目的

Dashboard Butler から VPS Codex CLI へ投げる経路は app-server bridge が常時接続であることを前提にする。bridge が未接続になると Butler から復旧操作を投げられないため、VPS 内部の user systemd timer が `scripts/watch-dashboard-app-server-bridge.mjs` を定期実行し、限定された条件だけで bridge を自律復旧する。

この watchdog は次を守る。

- restart 対象は `vtdd-dashboard-app-server-bridge-unresolved.service` だけ。
- default では deploy、credential mutation、permission mutation、root 操作をしない。
- lock directory で同時実行を避ける。
- `maxAttempts` / `attemptWindowMs` で retry budget を超えたら `circuit_open` にして止める。
- state は直近件数だけ保持する。
- local log は追記無制限ではなく直近行数だけ保持する。
- runtime URL、bearer token、repository が明示設定されている時だけ `/v2/events/vps-runner` に事後報告する。

## ファイル

- script: `scripts/watch-dashboard-app-server-bridge.mjs`
- service template: `docs/systemd/vtdd-dashboard-app-server-bridge-watchdog.service`
- timer template: `docs/systemd/vtdd-dashboard-app-server-bridge-watchdog.timer`
- heartbeat: `~/vtdd-runner/run/dashboard-bridge-unresolved.heartbeat.json`
- bounded state: `~/vtdd-runner/state/dashboard-bridge-watchdog-state.json`
- bounded log: `~/vtdd-runner/logs/dashboard-bridge-watchdog.log`

## 設定

`systemctl --user` の service 環境または user environment で設定する。

- `VTDD_DASHBOARD_BRIDGE_WATCHDOG_REPOSITORY`: `/v2/events/vps-runner` へ報告する repository。public/core default にはしない。
- `VTDD_RUNTIME_URL`: Worker runtime URL。
- `VTDD_GATEWAY_BEARER_TOKEN`: Worker machine route bearer token。
- `VTDD_DASHBOARD_BRIDGE_WATCHDOG_MAX_ATTEMPTS`: default `3`。
- `VTDD_DASHBOARD_BRIDGE_WATCHDOG_ATTEMPT_WINDOW_MS`: default `600000`。
- `VTDD_DASHBOARD_BRIDGE_WATCHDOG_STALE_HEARTBEAT_MS`: default `90000`。
- `VTDD_DASHBOARD_BRIDGE_WATCHDOG_MAX_LOG_LINES`: default `100`。

`VTDD_DASHBOARD_BRIDGE_WATCHDOG_REPOSITORY`、`VTDD_RUNTIME_URL`、`VTDD_GATEWAY_BEARER_TOKEN` のいずれかがない場合、自動復旧と bounded local state/log は動くが Dashboard への事後報告は `unconfigured` になる。

## 手動検証

```sh
node scripts/watch-dashboard-app-server-bridge.mjs --dry-run --no-report
```

user systemd に入れた後:

```sh
systemctl --user daemon-reload
systemctl --user enable --now vtdd-dashboard-app-server-bridge-watchdog.timer
systemctl --user list-timers vtdd-dashboard-app-server-bridge-watchdog.timer
systemctl --user status vtdd-dashboard-app-server-bridge-watchdog.service
```

## 停止条件

`circuit_open` が出た場合、自動復旧は retry budget を超えて止まっている。VPS で `systemctl --user status vtdd-dashboard-app-server-bridge-unresolved.service` と `journalctl --user -u vtdd-dashboard-app-server-bridge-unresolved.service -n 200 --no-pager` を確認し、原因を潰してから timer を継続する。

この状態は通常の未接続ではなく recovery incident として扱う。
