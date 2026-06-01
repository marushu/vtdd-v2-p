# Issue #590 / Issue #413: transient progress checkpoints without chat spam

## 完了体験

Dashboard Butler で長めの開発を開始した owner が、開発終了まで無言で待たされない。ただし、`考えています` / `コマンドを実行しています` のような汎用 checkpoint が Butler thread の通常 message として積み上がり、チャット履歴を埋めない。owner は turn の進行を transient UI で見られ、履歴には最終回答、失敗、承認待ち、確認待ちなど後から読む意味のあるものだけが残る。

この PR は生の chain-of-thought を出さない。汎用作業 checkpoint は transient 表示に閉じ、最終回答要約への置換までは次 slice とする。

## VTDD 全体で進める部分

Issue #590 の silent wait recovery と Issue #413 の owner-facing execution progress をつなぐ。VTDD の root blocker は「VPS Codex が動いているか」ではなく「Butler から作業の筋道が見えないこと」だが、進行可視化を通常 chat message として残すと owner-facing UX を壊す。app-server bridge event は Dashboard へ流し続け、Worker 側で transient 表示と durable 履歴を分離する。

## 設計

app-server bridge が既に受けている Codex app-server lifecycle event は、引き続き `app_server_status` として DashboardChatRoom に渡す。Worker 側は `app_server_status` を基本的に transient UI state として扱い、`persistProgress` が付いていても、それだけでは durable thread message に保存しない。

durable thread message に保存するのは、owner action が必要で履歴価値がある stage に絞る。現時点では `waiting_approval` と `waiting_user_input` を対象にする。`planning` / `thinking` / `command` / `file_change` / `tool_call` / `test` / `debug_slow_turn` は transient-only に戻す。

失敗や timeout recovery は既存どおり system message として残す。turn completion は最終回答として残る。durable checkpoint は role `butler` / status `thinking` として短い owner-facing text だけを保存し、直近に同じ role/status/text がある場合は保存しない。

## 仮説

PR #730 後の原因は逆に、`src/worker/runtime.js` が `persistProgress` と既知 stage fallback を durable message 化したこと。結果として「無言」は軽減したが、`考えています` / `コマンドを実行しています` のような低情報 checkpoint が通常チャットを埋める。owner が求めているのは ChatGPT / Codex アプリ相当の進行表示であり、履歴汚染ではない。

## 検証計画

- Worker test: `persistProgress: true` の汎用 `app_server_status` が durable thread message にならず、transient status にだけ出ること。
- Worker test: `persistProgress` がない汎用 stage も durable checkpoint にならないこと。
- Worker test: `waiting_approval` / `waiting_user_input` は owner action が必要な durable checkpoint として残ること。
- Worker test: progress event が複数回来ても通常 chat message が増殖しないこと。
- Bridge test: Codex plan / command / file change / tool / reasoning summary events は引き続き `persistProgress` / stage を出せること。Worker 側で永続化を抑制するため、bridge event visibility は失わない。
- `npm run build:worker`、`npm run check:generated-worker`、full `npm test` を通す。

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`: 通常は変更しない。event emission は残す。
- `src/worker/runtime.js`: `app_server_status` の `persistProgress` を durable message 化の条件から外し、owner action stage だけを durable 化する。
- `test/dashboard-app-server-bridge.test.js`: 必要なら bridge event mapping regression を維持する。
- `test/worker.test.js`: transient-only regression、owner action durable regression、message spam regression。
- `worker.js`: generated worker bundle。

## 既に通っている経路

PR #721 / PR #727 で activity watchdog と stalled 表示は改善された。PR #728 で slow-turn harness が入った。PR #729 で同一 stalled SYSTEM の増殖は止めた。PR #730 で progress checkpoint の durable message 化を入れたが、owner live feedback により chat spam として不適切だと判明した。

## 未確認の境界

Codex app-server が提供する event の完全な種類は今後変わる可能性がある。今回の PR は既存実装で既に map している event だけを対象にする。VPS checkout 同期 / bridge restart は runtime 操作なのでこの PR では実行しない。

## 穴が出そうな箇所

- raw terminal output や raw reasoning を durable message に混ぜると UX と安全境界を壊す。
- 汎用 status を durable にすると thread spam になる。
- transient-only の既存挙動を壊すと通常 chat が重くなる。
- final summary で途中 checkpoint を置き換える機構は別 slice に残る。

## PR 前に確認すること

Issue #590 / Issue #413、active execution queue、PR #728 / PR #729 truth、OpenAI streaming/realtime docs の lifecycle event 方針、既存 app-server bridge mapping、Worker status handling を確認する。

## 実装候補と捨てた案

採用案は `persistProgress` を durable 保存の条件から外し、owner action stage だけを durable checkpoint にする案。捨てた案は全 `app_server_status` durable 化、raw output 保存、VPS Codex CLI commentary の全文保存、final summary replacement まで同時実装する案。

## merge 後に通す E2E

Production Dashboard Butler live E2E として、最新 VPS checkout / bridge restart 後に `Issue #590 の slow turn を 3分で実行して` を送り、旧 2分 timeout SYSTEM が出ないこと、進行状態は transient UI で見えること、通常 chat message として `考えています` / `コマンドを実行しています` が増殖しないこと、完了応答が同じ thread に戻ることを検証する。

## 次の PR を増やさない理由

この PR は PR #730 の UX regression を戻しつつ、進行検知自体は残す。final summary replacement、deploy後 bridge parity 自動復旧、stop/interrupt UI は別 blocker なので、この PR に混ぜると検証境界が壊れる。

## 停止条件

raw chain-of-thought / raw terminal output が durable message に出る、通常 transient status が全て durable 化される、同一 progress が増殖する、deploy / credential / permission / root 操作が必要になる場合は停止する。
