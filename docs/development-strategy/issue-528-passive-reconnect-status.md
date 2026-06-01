# Issue #528 Dashboard WebSocket heartbeat strategy

## 完了体験

オーナーは Dashboard Butler の通常チャットを開いたまま、ブラウザ側 Dashboard WebSocket と VPS app-server bridge WebSocket が idle close されにくい状態で会話を続けられる。もし close/error が起きても、入力欄下の `接続が切れました。履歴を確認しながら復帰しています。` の点滅に邪魔されず、ログイン切れ、送信確認前切断、オフラインなどオーナー操作が必要な時だけ短い状態表示が出る。

## VTDD 全体で進める部分

Issue #528 の「Dashboard Butler を ChatGPT iOS 相当の通常チャット面にする」品質を進める。Issue #450 の live app-server bridge、Issue #579 の reconnect/auth recovery と関係する。この slice は #637 capability lifecycle を閉じず、Dashboard Butler 通常チャットの WebSocket heartbeat と passive recovery 表示制御だけを扱う。

## 設計

既存の Worker WebSocket 受信側は raw text `ping` に `pong` を返せるため、その契約を使う。Dashboard ブラウザ側は WebSocket open 中だけ recursive `setTimeout` で raw `ping` を送り、close/error で heartbeat を止める。VPS app-server bridge も同じく open 中だけ raw `ping` を送り、close/error で止める。

あわせて `setConnectionRecoveryStatus()` を visible opt-in にする。passive recovery では `composer-status` に文字を出さず、`data-reconnect-attempt`、`data-websocket-state`、`data-recovery-message` に runtime truth を残す。owner action required の status は既存 `setStatus()` 経路を維持する。

## 仮説

Worker の `DashboardChatRoom.handleSocketMessage()` には ping/pong があるが、Dashboard ブラウザと app-server bridge が heartbeat を送っていないため、idle close が発生し、bridge reconnect と Dashboard reconnect が断続的に走っているという仮説。さらに #565 で temporary status と `:empty` は入ったが、`close` / `error` / `scheduleReconnect` / `visibilitychange` が短周期で `setConnectionRecoveryStatus()` を呼び、because `setConnectionRecoveryStatus()` が毎回 `setStatus()` へ渡しているため、2.4 秒で消えてもすぐ再点灯し、mac Chrome と iPhone ではチラつき・居座りに見える。

## 検証計画

worker HTML contract test で Dashboard ブラウザ側 heartbeat が raw `ping` を送ること、passive recovery が visible opt-in になっていること、`接続が切れました...` / `接続できませんでした...` の passive 呼び出しが `visible: true` を渡していないこと、data 属性に recovery truth が残ることを確認する。app-server bridge test で `VTDD_DASHBOARD_BRIDGE_HEARTBEAT_MS` と raw `ping` 送信を確認する。`npm run build:worker` と `npm run verify:worker` を通す。merge/deploy 後に production mac Chrome / iPhone PWA で composer 下の点滅が止まり、VPS bridge pickup が安定することを確認する。

## 改修見積もり

- `src/worker/runtime.js`: Dashboard chat WebSocket heartbeat、`setConnectionRecoveryStatus()` の visible opt-in 化、再ログイン復帰時の passive 表示化。
- `scripts/run-dashboard-app-server-bridge.mjs`: VPS app-server bridge の WebSocket heartbeat と `--heartbeat-ms` / `VTDD_DASHBOARD_BRIDGE_HEARTBEAT_MS`。
- `test/worker.test.js`: Dashboard chat shell contract に heartbeat、recovery data 属性、passive status 非表示条件を追加。
- `test/dashboard-app-server-bridge.test.js`: bridge heartbeat config と raw `ping` 送信を追加。
- `worker.js`: generated worker。

## 既に通っている経路

Dashboard chat は HTTP fallback / refreshThread / draft persistence で入力保持と履歴復帰ができる。Issue #565 で empty status の余白除去、Issue #579/#654 で reconnect/auth recovery と fallback resume の実装・証跡がある。

## 未確認の境界

この Codex セッションから VPS へ SSH read-only 確認はできなかったため、production service log の live truth は未確認。heartbeat で idle close 要因を潰すが、Cloudflare / PWA / app-server bridge / VPS service 側に別原因の close/error が残る可能性はある。

## 穴が出そうな箇所

passive status を消すことで本当の接続断が見えなくなるリスクがあるため、data 属性には残す。owner action required のログイン切れ、オフライン、送信確認前切断まで隠すと復旧不能になるため触らない。

## PR 前に確認すること

Issue #528 / #579 / #565 の scope、`src/worker/runtime.js` の composer status 経路、`test/worker.test.js` の Dashboard chat shell assertions、generated worker、PR body guardrail を確認する。

## 実装候補と捨てた案

採用案は既存 ping/pong 契約を使った Dashboard ブラウザ側・VPS app-server bridge 側 heartbeat と、passive recovery を visible opt-in にして通常 UI には出さず data 属性に残す案。捨てた案は文言だけ短くする案、temporary 秒数を短くする案、`setInterval` polling、debug drawer 新設まで広げる案。

## merge 後に通す E2E

Production deploy 後の live E2E として、mac Chrome と iPhone/PWA で Dashboard Butler 通常チャットを開き、WebSocket heartbeat が動いた状態で composer 下に `接続が切れました。履歴を確認しながら復帰しています。` が点滅しないことを確認する。あわせてログイン切れ・オフラインなど owner action required 表示は残ること、VPS app-server bridge が raw `ping` で維持されることを確認する。

## 次の PR を増やさない理由

この PR は WebSocket heartbeat と通常チャット面の表示ノイズ抑制を同時に行う。VPS helper lifecycle や #637 の completion claim には踏み込まず、Durable Object の再設計や queue/timer 方式変更まで広げないため、同じ PR の後始末を増やさない。

## 停止条件

owner action required の復旧表示まで消す必要が出る、heartbeat ではなく queue/runner/timer の実行方式変更に踏み込まないと成立しない、または Dashboard Butler 通常チャットではなく Custom GPT / Action Schema 側の修正に逸れる場合は停止する。
