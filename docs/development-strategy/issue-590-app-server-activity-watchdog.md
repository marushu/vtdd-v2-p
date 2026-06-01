# Issue #590 app-server activity watchdog

## 完了体験

Dashboard Butler が長めの Codex app-server turn を待っている間、owner は「止まった」のか「考え中 / 実行中」なのかを区別できる。固定 2 分で失敗扱いにせず、app-server から届く `thinking`、plan、diff、command output、tool progress、reasoning summary などの進行イベントを生存信号として扱う。進行イベントが途切れた時だけ quiet / stalled として owner-facing に出す。

## VTDD 全体で進める部分

この PR は Issue #590 の timeout recovery を前進させる。Issue #413 の実行中フィードバック、Issue #450 の live app-server path、Issue #528 の通常チャット体験にも関係するが、停止ボタン、割り込み UI、Voice、PWA 通知、deploy はこの PR では実装しない。

## 設計

- `scripts/run-dashboard-app-server-bridge.mjs` で Codex app-server の通知をより広く分類する。
- reply delta だけでなく `turn/plan/updated`、`item/plan/delta`、`turn/diff/updated`、command/file/tool/reasoning 系イベントを activity として扱う。
- activity が届くたびに watchdog をリセットする。
- quiet timeout は transient status として出し、turn を終了させない。
- stalled timeout は既存の recoverable `app_server_turn_failed` を使って thread に残す。
- Worker は新しい progress stage を自然な日本語 transient status に変換する。

## 仮説

現在の詰まり感は、bridge が `turnTimeoutMs` の単発 timer を start 時に張り、途中 activity を見ても延長しないことが主因。Codex app-server protocol には `turn/started`、`item/agentMessage/delta` 以外にも進行中を示す通知があるため、それを watchdog のリセット条件にすれば、実行中なのに固定 2 分で stalled 扱いされる誤判定を減らせる。

狭く timeout 文言だけ直すと、長い開発中にまた誤 timeout が出る。逆に timer を単純に長くしすぎると、本当に詰まった時に owner が待たされる。activity based watchdog が最小の安定化策。

## 検証計画

- `test/dashboard-app-server-bridge.test.js`: progress activity が stalled timeout を延長すること。
- `test/dashboard-app-server-bridge.test.js`: quiet timeout が thread failure ではなく `app_server_status` として出ること。
- `test/dashboard-app-server-bridge.test.js`: plan / command / diff / tool progress が owner-facing stage に map されること。
- `test/worker.test.js`: bridge status stage が Dashboard transient status に変換されること。
- `npm run build:worker`: Worker bundle を更新すること。
- `npm run check:generated-worker`: generated worker 差分が一致すること。
- `git diff --check`: 空白差分がないこと。

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`: app-server event mapping、activity watchdog、quiet timeout option。リスクは timer cleanup と late completion path。
- `src/worker/runtime.js`: progress stage 文言追加。リスクは既存 transient status の文言 regression。
- `test/dashboard-app-server-bridge.test.js`: bridge unit tests 追加。リスクは短時間 timer の flake。
- `test/worker.test.js`: Worker mapping test 追加または既存 test 拡張。リスクは broadcast message ordering。
- `worker.js`: build artifact 更新。リスクは generated worker の未更新。

## 既に通っている経路

PR #720 で timeout は英語 raw error ではなく recoverable Japanese stalled message として保存されるようになった。late completion も thread に追加される。

## 未確認の境界

ChatGPT / Codex 公式アプリの内部 timeout 判定は公開仕様として確認できない。今回の実装は公開 UI の推測コピーではなく、現在の Codex app-server generated protocol から読める通知を使った VTDD 側の安定化である。

## 穴が出そうな箇所

- app-server が本当に無通知で長時間処理するケースでは quiet が出る。
- reasoning text delta は内部推論を owner に見せず、生存信号としてのみ扱う。
- `turn/completed` が interrupted / failed を返す場合は terminal event として扱う必要がある。
- WebSocket 切断そのものはこの PR では直さない。

## PR 前に確認すること

- branch が latest `origin/main` から始まっていること。
- Issue #590 の Success Criteria から外れていないこと。
- #413 の UI stop / interrupt scope を混ぜていないこと。
- owner-specific URL / secret / account identifier を追加していないこと。

## 実装候補と捨てた案

- 採用: activity based watchdog。app-server event が届く限り timeout を延長する。
- 採用: quiet warning と stalled failure を分ける。
- 捨てた案: 固定 timeout を 10 分に伸ばすだけ。詰まり検知が遅くなる。
- 捨てた案: reasoning content を表示する。chain-of-thought 露出リスクがある。
- 捨てた案: この PR で stop / interrupt UI まで実装する。Issue #413 / #528 の仕様固めが必要。

## merge 後に通す E2E

production Dashboard Butler で長めの同一 thread turn を送信し、progress / thinking が届いている間に stalled message が出ないことを確認する。進行イベントが途切れたケースでは quiet が transient に出て、stalled 時には recoverable message として保存されることを確認する。

## 次の PR を増やさない理由

#590 の PR #720 は recoverable timeout 表示までで、誤 timeout を減らす activity watchdog が未接続だった。この PR は同じ Issue の次の最小 slice であり、UI stop / interrupt までは広げない。

## 停止条件

- Codex app-server protocol から activity event を安全に識別できない。
- tests が timer flake で安定しない。
- stop / interrupt UI を同時に触らないと成立しないことが判明する。
- deploy / credential / permission / root 操作が必要になる。
