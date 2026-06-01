# Issue #590 / Issue #413: progress checkpoints to Butler thread

## 完了体験

Dashboard Butler で長めの開発を開始した owner が、開発終了まで無言で待たされない。Butler thread には、VPS Codex / app-server bridge が今どの段階にいるかが短い日本語の checkpoint として出る。owner は「何を読んでいるか」「どの仮説であたりをつけているか」「検証中か」「テスト中か」「reviewer 待ちか」を追える。

この PR は生の chain-of-thought を出さない。owner-facing な作業 checkpoint だけを出す。

## VTDD 全体で進める部分

Issue #590 の silent wait recovery と Issue #413 の owner-facing execution progress をつなぐ。VTDD の root blocker は「VPS Codex が動いているか」ではなく「Butler から作業の筋道が見えないこと」なので、app-server bridge event を Dashboard thread へ流す実行可視化レイヤーを作る。

## 設計

app-server bridge が既に受けている Codex app-server lifecycle event を、`app_server_status` の transient だけで終わらせず、`persistProgress` が付いた checkpoint event として DashboardChatRoom に渡す。Worker 側は `persistProgress` のある `app_server_status` を durable thread message に保存する。

レビュアー指摘を受け、Worker 側は `persistProgress` がない場合でも、`planning` / `command` / `file_change` / `tool_call` / `test` など既知の安全な stage だけは checkpoint として保存する。これにより、VPS app-server bridge process が一部古く、まだ `persistProgress` を付けない場合でも、既存 stage event が出ている限り owner-facing progress は thread に残る。

通常の `app_server_status` は今まで通り transient-only にする。これにより既存の軽い status 表示は壊さない。durable checkpoint は role `butler` / status `thinking` として短い owner-facing text だけを保存する。直近に同じ role/status/text がある場合は保存しない。

## 仮説

現状の原因は、`scripts/run-dashboard-app-server-bridge.mjs` が Codex lifecycle event を `app_server_status` として Dashboard に送っているが、`src/worker/runtime.js` が `app_server_status` を transient-only として扱っていること。結果として、Codex 側で進行 event が出ても Butler thread には残らず、owner には「無言」に見える。

## 検証計画

- Worker test: `persistProgress: true` の `app_server_status` が transient と durable thread message の両方になること。
- Worker test: `persistProgress` がない既知の安全な stage も durable checkpoint になること。
- Worker test: 同じ progress checkpoint が連続しても durable message は増殖しないこと。
- Worker test: safety list 外の `app_server_status` は従来どおり transient-only のままであること。
- Bridge test: Codex plan / command / file change / tool / reasoning summary events が `persistProgress: true` を持つこと。
- `npm run build:worker`、`npm run check:generated-worker`、full `npm test` を通す。

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`: Codex lifecycle event のうち owner-facing checkpoint にしたい status event に `persistProgress: true` を付与する。raw delta / raw provider message は保存しない。
- `src/worker/runtime.js`: `app_server_status` の `persistProgress` と既知の安全な stage を読み、owner-facing stage text を durable message として保存する。重複 checkpoint を append 前に除外する。
- `test/dashboard-app-server-bridge.test.js`: bridge event mapping regression。
- `test/worker.test.js`: persistent progress / duplicate suppression / transient-only regression。
- `worker.js`: generated worker bundle。

## 既に通っている経路

PR #721 / PR #727 で activity watchdog と stalled 表示は改善された。PR #728 で slow-turn harness が入った。PR #729 で同一 stalled SYSTEM の増殖は止めた。しかし、owner-facing progress checkpoint はまだ Butler thread に出ていない。

## 未確認の境界

Codex app-server が提供する event の完全な種類は今後変わる可能性がある。今回の PR は既存実装で既に map している event だけを対象にする。VPS checkout 同期 / bridge restart は runtime 操作なのでこの PR では実行しない。

## 穴が出そうな箇所

- raw terminal output や raw reasoning を durable message に混ぜると UX と安全境界を壊す。
- 全ての status を durable にすると thread spam になる。
- transient-only の既存挙動を壊すと通常 chat が重くなる。
- final summary で途中 checkpoint を置き換える機構は別 slice に残る。

## PR 前に確認すること

Issue #590 / Issue #413、active execution queue、PR #728 / PR #729 truth、OpenAI streaming/realtime docs の lifecycle event 方針、既存 app-server bridge mapping、Worker status handling を確認する。

## 実装候補と捨てた案

採用案は `persistProgress` flag による opt-in durable checkpoint と、Worker 側の既知安全 stage fallback。捨てた案は全 `app_server_status` durable 化、raw output 保存、VPS Codex CLI commentary の全文保存、final summary replacement まで同時実装する案。

## merge 後に通す E2E

Production Dashboard Butler live E2E として、最新 VPS checkout / bridge restart 後に `Issue #590 の slow turn を 3分で実行して` を送り、開始・継続・完了 checkpoint が Butler thread に見えること、同一文言が増殖しないことを検証する。

## 次の PR を増やさない理由

この PR は最初の owner-facing progress checkpoint 経路だけを作る。final summary replacement、deploy後 bridge parity 自動復旧、stop/interrupt UI は別 blocker なので、この PR に混ぜると検証境界が壊れる。

## 停止条件

raw chain-of-thought / raw terminal output が durable message に出る、通常 transient status が全て durable 化される、同一 progress が増殖する、deploy / credential / permission / root 操作が必要になる場合は停止する。
