# Issue #590 root timeout recovery

## 完了体験

Dashboard Butler で長めの開発依頼を投げても、2分固定で `codex app-server から進行イベントがしばらく届いていません` が thread 上の stalled/failure として出ない。進行イベントがない時間は、owner-facing には quiet progress として「接続と実行状態を確認中」と分かる。実際に長時間返らない場合だけ、hard stalled recovery として同じ thread で続けるための救済を出す。

## VTDD 全体で進める部分

Issue #590 の parent root である silent wait / timeout recovery を前進させる。PR #726 は stalled 後の追加入力を救済したが、production E2E で 2分固定 stalled が残ることが確認された。この PR では 2分固定の誤判定そのものを減らす。

## 設計

- app-server activity が届くたびに quiet / stalled watchdog をリセットする既存設計は維持する。
- quiet は失敗ではなく transient progress として出す。
- quiet は一度だけでなく、無通信が続く間は同じ粒度で再通知できるようにする。
- default hard stalled timeout は 2分から通常開発を妨げない長めの救済時間へ変更する。
- hard stalled は turn を永久に詰まらせないための救済であり、通常の進行表示ではない。
- Dashboard Worker の thread message 永続化は hard stalled のみ対象にする。

## 仮説

production で owner が見ている不快感の主因は、bridge default の `DEFAULT_TURN_TIMEOUT_MS = 2 * 60 * 1000` が hard stalled として thread に残ること。Codex app-server は長い reasoning / tool-less 作業中に owner-facing activity event を出さないことがあるため、2分で terminal recovery を出すと誤判定になる。

activity based watchdog 自体は必要だが、2分 hard stalled は短すぎる。quiet と hard stalled を分離し、quiet を繰り返し出すことで「待たされているが死んではいない」状態を owner に見せる。

## 検証計画

- `test/dashboard-app-server-bridge.test.js`: default parse args が 2分 hard timeout ではないこと。
- `test/dashboard-app-server-bridge.test.js`: quiet が stalled failure なしに繰り返し出ること。
- `test/dashboard-app-server-bridge.test.js`: hard stalled は長い救済時間として明示設定時だけ短時間 test で発火すること。
- `test/dashboard-app-server-bridge.test.js`: activity event が quiet / stalled をリセットすること。
- `test/worker.test.js`: quiet status は thread message を増やさず transient status に留まること。
- `npm run build:worker`
- `npm run check:generated-worker`
- `git diff --check`

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`: default hard stalled timeout、quiet repeat watchdog、owner-facing text。リスクは timer cleanup と test flake。
- `test/dashboard-app-server-bridge.test.js`: default timeout / repeated quiet / hard stalled tests。リスクは短時間 timer の flaky 化。
- `worker.js`: build artifact 同期。runtime source 変更が bridge script だけなら不要だが、build check で確認する。

## 既に通っている経路

PR #720 は recoverable timeout 表示を導入した。PR #721 は app-server activity watchdog を追加した。PR #724 は stale client self-refresh を追加した。PR #726 は stalled 後の follow-up input を追加した。

## 未確認の境界

Codex app-server が内部 reasoning 中にどの通知を必ず出すかは公開 contract として未確認。通知が全くない長時間処理は存在し得る前提で扱う。

## 穴が出そうな箇所

- hard stalled を無効化すると本当に返らない turn が queue を詰まらせる。
- hard stalled を短くすると今回の 2分問題が再発する。
- quiet を thread message にすると会話が noisy になる。
- quiet を出さないと owner は待ち状態を観測できない。

## PR 前に確認すること

origin/main が PR #726 merge 後であること。Issue #590 が open であること。変更が stop/interrupt UI や Issue #413 scope に広がっていないこと。

## 実装候補と捨てた案

採用: 2分 hard stalled を長めの救済時間に変更し、quiet を無通信中の owner-facing progress として繰り返す。

捨てた案: timeout を完全に無効化する。永久詰まりを検知できなくなる。

捨てた案: 2分 stalled の文言だけ柔らかくする。thread に recovery message が残る不快さは変わらない。

捨てた案: stop/interrupt UI を同時に入れる。公式 UI 調査と別 Issue の仕様固めが必要。

## merge 後に通す E2E

production Dashboard Butler の同じ thread で長めの Issue #590 E2E 依頼を投げる。2分時点では hard stalled / recovery message が thread に残らず、quiet progress だけになることを見る。長い処理の返信が戻ったら同じ thread に返信が入ることを確認する。

## 次の PR を増やさない理由

2分固定 stalled は Issue #590 の本体であり、PR #726 の production E2E で未解決が確認された。この PR は同じ root symptom の最小修正で、UI stop / interrupt や bridge reconnect へは広げない。

## 停止条件

Codex app-server の turn が無通知で長時間処理するだけでなく completion も返さない場合、hard stalled 以外の安全な復旧 path が必要になる。deploy、credential、permission、root helper、Issue close が必要になったら停止する。
