# Issue #717: VPS runner immediate wakeup

## Owner-facing completion experience

Dashboard Butler から `vps_runner` の開発実行を投げたあと、州平が次の
1分 timer tick を待たなくても VPS runner が起動し始める。

GitHub queue comment は従来通り runtime truth として残す。即時 wakeup は
latency 改善だけを担当し、失敗しても `vtdd-vps-runner.timer` が fallback
として回収する。

## Scope

- Worker の `/v2/action/execute` が `vps_runner` queue comment 投稿に成功した後、
  `dashboardThreadId` がある場合だけ DashboardChatRoom に wakeup を依頼する。
- DashboardChatRoom は同じ thread の app-server bridge socket にだけ
  `runner_wakeup_requested` を送る。
- Dashboard app-server bridge は固定の user systemd command だけを実行する。

## Authority boundary

Allowed fixed command:

```sh
systemctl --user start vtdd-vps-runner.service
```

This slice must not add:

- arbitrary shell execution
- payload-controlled command or arguments
- root or sudo execution
- VPS privileged maintenance helper execution
- deploy authority
- merge or issue-close authority
- credential mutation

## Hypothesis

Upcoming VTDD work will repeatedly use the VPS runner. A maximum one minute
polling delay is small once, but costly when repeated across many owner turns.
Keeping the timer as fallback while adding immediate wakeup should reduce
perceived waiting without weakening GitHub queue truth or authority boundaries.

## Validation plan

- Bridge command test proves the app-server bridge uses only the fixed user
  systemd command with `shell:false`.
- Worker dispatch test proves `vps_runner` queue dispatch reports wakeup status.
- DashboardChatRoom test proves wakeup is sent only to app-server bridge sockets.
- `npm run build:worker` regenerates `worker.js`.
- `npm run check:generated-worker` proves generated worker parity.
- Production E2E after merge/deploy should confirm queue-to-pickup lead time.

## Stop conditions

Stop if implementation requires:

- public inbound VPS API
- root/sudo authority
- arbitrary command execution from Worker payload
- skipping GitHub queue comment truth
- claiming production lead-time improvement without live evidence

