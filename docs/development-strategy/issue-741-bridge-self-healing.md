# Issue #741 bridge self-healing strategy

## 完了体験

Dashboard app-server bridge が deploy 後 restart / reconnect 失敗やその他の理由で未接続・停止・stale になった時、owner が Mac Codex や SSH を開く前に、VPS 内部の watchdog が安全な上限つきで復旧を試みる。復旧できた場合は Dashboard Butler の同じ main thread に「未接続を検知した、VPS watchdog が固定 restart を実行した、現在は復旧している、before/after はこれ」と事後報告する。復旧できない場合は retry budget / circuit breaker で停止し、緊急 blocked として報告する。

## VTDD 全体で進める部分

Issue #741 の lifecycle guard と Issue #637 の VPS recovery plane のうち、bridge に依存しない VPS 内部 self-healing を作る。PR #823 は deploy 後 restart request を GitHub Issue comment queue に溜めないようにしたが、bridge 未接続時の復旧そのものは未接続だった。この slice は `bridge_down -> bounded VPS self-heal -> Dashboard Butler postmortem` を最小接続する。

## 設計

watchdog script は VPS user 権限で動き、`systemctl --user show/is-active` による service state と bridge heartbeat file を読む。対象は fixed service `vtdd-dashboard-app-server-bridge-unresolved.service` に限定する。異常判定は active/running でない、MainPID がない、heartbeat file がない、または heartbeat が stale threshold を超える場合とする。heartbeat は ping 送信ではなく Worker からの `pong` 受信で更新する。検知後は grace period を置いて再確認し、一時的な揺らぎや provider 側自動復旧と競合しない。

復旧実行前に single-flight lock を取得する。lock 親ディレクトリは初回起動時に作成し、stale lock は TTL 後に破棄して復旧する。attempt history は request body queue ではなく VPS local の bounded JSON state に保存し、一定 window 内の max attempts を超えたら restart しない。失敗時は backoff/circuit breaker として `circuit_open` を返し、無限 retry で VPS resource を食い潰さない。

restart は fixed command `systemctl --user restart vtdd-dashboard-app-server-bridge-unresolved.service` のみを実行する。任意 command / arbitrary service / deploy / credential / permission mutation は扱わない。実行前後に PID、ActiveState、SubState、ActiveEnterTimestamp、ExecMainStatus を取得する。必要に応じて `origin/main` への sync は deploy後 helper の責務であり、この watchdog は bridge process recovery に限定する。

事後報告は既存 Worker machine route `/v2/events/vps-runner` を使う。bridge が落ちていてもこの route は bridge に依存しない。runtime URL と bearer token が設定されている時だけ POST し、未設定なら local log/state に残す。routine healthy check は default では POST しない。Dashboard thread は `dashboard-main-unresolved` を default にする。

systemd user service/timer template は repo に置くが、この PR では VPS へ install/enable しない。installation / deploy は scoped approval または後続 E2E で扱う。

## 仮説

bridge が未接続になると Dashboard Butler の通常 VPS handoff は使えないため、復旧は bridge 外側の VPS 内部 watchdog が担う必要がある。systemd `Restart=always` だけでは service process 落ちは戻せても WebSocket stale / reconnect failure / deploy後再接続失敗の owner-facing truth と retry budget が足りない。専用 watchdog は systemd timer で定期実行し、bounded restart と postmortem event を出すのが最小で安全。

## 検証計画

- Unit: healthy active/running bridge は restart しない。
- Unit: inactive bridge は grace 再確認後、budget 内なら fixed restart し、before/after truth を返す。
- Unit: retry budget 超過時は restart せず `circuit_open` を返す。
- Unit: single-flight lock 取得失敗時は `locked` を返し、重複 restart しない。
- Unit: report payload は `/v2/events/vps-runner` 互換で secrets を含まない。
- Unit: state/log retention は件数上限で切り詰める。
- Local: `node --test test/dashboard-app-server-bridge-watchdog.test.js`
- Local: `node --test test/worker.test.js --test-name-pattern "VPS runner event"`

## 改修見積もり

- `scripts/watch-dashboard-app-server-bridge.mjs`: bounded self-healing watchdog。本体、state retention、lock、report payload、optional POST。
- `test/dashboard-app-server-bridge-watchdog.test.js`: watchdog unit tests。fake runner/fetch/fs path を使い、systemd 実行はしない。
- `docs/systemd/vtdd-dashboard-app-server-bridge-watchdog.service` / `.timer`: VPS user systemd template。install はしない。
- `docs/ops/dashboard-app-server-bridge-watchdog.md`: operator-facing setup/evidence docs。runtime URL や token は repo に固定しない。
- `worker.js`: Worker source に変更がない場合は触らない。

## 既に通っている経路

- `/v2/events/vps-runner` は gateway bearer auth で machine event を受け、Dashboard event store / chat store / Web Push / broadcast に接続済み。
- `scripts/sync-dashboard-app-server-bridge-after-deploy.mjs` は fixed service/ref で deploy後 sync/restart を実行できる。
- `vtdd-dashboard-app-server-bridge-unresolved.service` は user systemd service として restart 可能。

## 未確認の境界

- VPS に timer を install/enable するには実環境変更が必要で、この PR では実行しない。
- systemd unit の配置 path と env file path は VPS の現行運用に合わせる必要があるため、template と docs に留める。
- WebSocket heartbeat stale の runtime truth を Worker 側から直接読む route はこの PR では追加しない。初期 watchdog は systemd process/service state と configured stale threshold を使う。

## 穴が出そうな箇所

- Restart=always だけだと loop しやすく、owner-facing postmortem が残らない。
- timer が複数起動すると restart が重複するため lock が必要。
- state/log を無制限に残すと VPS disk pressure になるため retention が必要。
- circuit breaker が厳しすぎると復旧不能になるため、defaults は conservative にし、PR body に remaining tuning risk を書く。

## PR 前に確認すること

- fixed service 以外を restart しないこと。
- deploy / credential / permission / destructive cleanup を実行しないこと。
- retry budget / lock / retention が test で固定されていること。
- postmortem payload に token / approval id / raw secrets が入らないこと。
- Execution Queue Delta に `ROOT` と active Issues not downscoped を書くこと。

## 実装候補と捨てた案

採用: VPS user systemd timer から bounded watchdog script を起動し、fixed restart と `/v2/events/vps-runner` postmortem を行う。

捨てた案: bridge 未接続時に Dashboard Butler から bridge 経由で復旧する。bridge down 時に経路がないため不採用。

捨てた案: `while true systemctl restart`。retry budget / lock / circuit breaker / postmortem がなく、VPS resource を食い潰すため不採用。

捨てた案: GitHub Issue comment queue に復旧 request を溜める。PR #823 で止めた破綻設計に戻るため不採用。

## merge 後に通す E2E

1. VPS に watchdog timer を install/enable する approval-bound 手順を確認する。
2. bridge service を一度止めるか mock-safe な failure を作り、watchdog が budget 内で fixed restart することを確認する。
3. Dashboard Butler に postmortem event が出ることを確認する。
4. short window で budget 超過を作り、circuit breaker が restart を止めて blocked report を出すことを確認する。
5. watchdog log/state が retention 上限を超えて増え続けないことを確認する。

## 次の PR を増やさない理由

bridge self-healing は script / test / systemd template / operator docs が揃って初めて安全な最小単位になる。script だけでは install 不能、systemd template だけでは bounded safety がない。Worker route は既存 `/v2/events/vps-runner` を使うため、この PR で新 route は増やさない。

## 停止条件

- fixed user systemd restart 以外の任意 command が必要になる場合。
- root/sudo、credential mutation、permission mutation、deploy が必要になる場合。
- Dashboard postmortem に bridge 自身の接続が必須になる場合。
- retry budget なしでしか復旧できない場合。
