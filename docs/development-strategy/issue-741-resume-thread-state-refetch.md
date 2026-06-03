# Issue #741 resume thread state refetch 作戦図

## 完了体験

iPad / iPhone で Dashboard Butler を開いたまま sleep、他アプリ移動、PWA background を挟んでも、復帰後に同じ chat で最新 thread が再取得される。最終回答が既に保存されていれば表示され、まだ owner message で止まっている場合は「送信済み、返信待ち」と分かる進行表示が復元される。

## VTDD 全体で進める部分

Issue #741 の sleep / resume 復帰時 owner-facing continuity を進める。Issue #748 の `presence != persistence` 境界を守り、transient progress を Durable Object に高頻度保存しない。既に durable な owner message / final reply / failure / stalled を読み直して、UI 上の復帰状態を再構成する。

## 設計

Dashboard browser client の `refreshThread()` 後に最新 durable messages を評価する。最後の durable message が Butler final / failed / stalled なら transient progress を消す。最後が owner message のままなら、server-side thread に送信済みで app-server bridge の返信待ちであることを transient progress と status に表示する。`visibilitychange` 復帰時は socket が open に見えても `refreshThread()` を実行し、iPad の background 復帰で消えた UI state を再構成する。

## 仮説

iPad で「考えています…」が消える原因は、sleep / app switch 後に browser-local transient state が失われても、socket が open 扱いのままだと `visibilitychange` 復帰で `refreshThread()` が走らず、UI state を再構成できないこと。final reply は durable chat store に保存されるため、履歴再取得で戻せる。turn 中の細かい progress を保存するのではなく、owner message が最後なら waiting state を復元すれば、無言待ちを避けつつ #748 の cost boundary を守れる。

## 検証計画

- Unit: Dashboard HTML に `restoreThreadRecoveryState()` が入り、`refreshThread()` 後に呼ばれることを確認する。
- Unit: `visibilitychange` の visible 復帰で socket open 状態でも `refreshThread()` が走ることを確認する。
- Unit: owner message が最後の時に「送信済みです。app-server bridge の返信を待っています。」を表示する contract を確認する。
- Build: `npm run build:worker` と `npm run check:generated-worker` を通す。
- Worker test: `node --test test/worker.test.js` を通す。

## 改修見積もり

- `src/worker/runtime.js`: Dashboard HTML script に `restoreThreadRecoveryState()` を追加し、`refreshThread()` と `visibilitychange` 復帰処理を更新する。
- `worker.js`: Worker source build output。
- `test/worker.test.js`: HTML smoke assertion を追加する。

## 既に通っている経路

- `refreshThread()` は `/v2/dashboard/chat/:threadId` から durable messages を再取得できる。
- `pageshow` は既に `refreshThread()` を呼ぶ。
- `visibilitychange` は visible 復帰を検出できる。
- final reply / failed / stalled は durable chat message として保存される。
- Issue #748 により app-server transient burst は同一 mapping の DO put を増やさない。

## 未確認の境界

- 実機 iPad の PWA background 復帰で socket readyState がどう見えるかは browser behavior 依存。
- app-server が turn 中に完全停止した場合、細かい progress は復元しない。復元するのは durable owner message に基づく waiting state。
- production live E2E は merge/deploy 後に必要。

## 穴が出そうな箇所

- `refreshThread()` ごとに scrollToLatest すると owner が過去ログを読んでいる時に下へ戻される可能性がある。今回は既存挙動を変えず、sleep/resume の無言回避を優先する。
- waiting state を出し続けると、実際は bridge が落ちている場合に「進行中」と誤認させる可能性がある。文面は「返信を待っています。復帰中なら再接続します」に寄せ、完了主張にしない。
- Durable progress 保存を足すと #748 に反するため、この PR では追加しない。

## PR 前に確認すること

Issue #741、Issue #748、PR #743、PR #749、PR #752 の truth、現 client の `pageshow` / `visibilitychange` / `refreshThread()`、worker HTML smoke tests を確認する。

## 実装候補と捨てた案

- 採用: durable messages から waiting / complete / failure state を再構成する。
- 採用: visible 復帰時は socket open でも `refreshThread()` を実行する。
- 捨てた案: transient progress を DO storage に保存する。#748 の cost boundary に反する。
- 捨てた案: Web Push で毎 progress を通知する。通知頻度とコスト境界が未整理。

## merge 後に通す E2E

production deploy 後、iPad 実機で長めの Dashboard Butler turn を開始し、他アプリ移動または sleep 後に復帰する。同じ chat で final reply が戻ること、まだ完了していなければ送信済み/返信待ちの復帰表示が出ること、低頻度 durable write 以外を増やしていないことを確認する。

## 次の PR を増やさない理由

この PR は sleep/resume 復帰時の無言回避に限定する。systemd restart、periodic restart、metrics monitor、progress folding、Web Push は authority / cost / UX の境界が異なるため混ぜない。

## 停止条件

復帰状態を出すために high-frequency durable progress 保存が必要になる、deploy / bridge restart / credential / permission mutation が必要になる、または final reply persistence を壊す変更が必要になる場合は停止する。
