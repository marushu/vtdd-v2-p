# Issue #590 paced progress rendering 作戦図

## 完了体験

Dashboard Butler PWA で live progress checkpoint が出る時、文字が一瞬で入れ替わらず、ChatGPT / Codex アプリや話し言葉に近い速度で読める。内部処理は速いまま受け取り、owner に見せる文字だけを paced rendering にする。

## VTDD 全体で進める部分

Issue #590 の owner-facing observability のうち、live progress が「出るようになったが速すぎて読めない」UX blocker を小さく直す。Issue #637 の privileged maintenance 実行はこの slice では扱わない。

## 設計

chat-visible progress checkpoint の paragraph へ直接 `textContent` を即時置換しない。最新 text を pending として保持し、短い間隔で文字を追加する。新しい checkpoint が来ても、直前 checkpoint の最低表示時間を満たすまで次の text へ切り替えない。処理本体や WebSocket 受信、snapshot 保存は遅らせない。

## 仮説

原因は `renderThreadProgressCheckpoint()` が `paragraph.textContent = text` で checkpoint を即時置換しており、app-server delta が短時間に複数来ると owner の目が追いつかないこと。checkpoint 表示だけに pacing queue を入れれば、内部実行速度を落とさず読みやすさを改善できる。

## 検証計画

- Source/unit: Dashboard HTML に paced checkpoint rendering の timer、minimum display interval、reduced motion bypass が含まれること。
- Regression: 既存 dashboard / progress / composer tests を壊さないこと。
- Local: `node --test test/worker.test.js --test-name-pattern 'dashboard|DashboardChatRoom|progress|composer'`
- Generated: `npm run build:worker`, `npm run check:generated-worker`
- Hygiene: `git diff --check`

## 改修見積もり

- `src/worker/runtime.js`: `schedulePacedProgressCheckpointText()` 系を追加し、`renderThreadProgressCheckpoint()` が即時 `textContent` 置換をしないようにする。risk は E2E が text 即時反映を期待している場合の不安定化。
- `test/worker.test.js`: served dashboard source assertion を追加する。risk は source assertion が brittle になること。
- `worker.js`: generated worker を同期する。

## 既に通っている経路

PR #795/#796/#797 で low-information status の checkpoint 消失、composer progress の画面占有、local E2E evidence が改善した。owner は強制キャッシュリロード済みで、次の UX blocker として「出るが速すぎる」を報告した。

## 未確認の境界

iOS Safari / production PWA の実速度は merge/deploy 後に owner evidence が必要。今回の slice は text pacing の初期実装であり、将来の TTS 同期や voice cadence は未実装。

## 穴が出そうな箇所

最終回答本文の token streaming と progress checkpoint は別物。今回 progress checkpoint だけを paced にしても、最終回答の表示速度が別経路なら追加 slice が必要になる可能性がある。

## PR 前に確認すること

Issue #590 が open、main が `origin/main` と一致、untracked `.tmp/` / `test-results/` を含めない、worker generated file を同期する。

## 実装候補と捨てた案

採用: progress checkpoint の表示だけを paced queue にする。捨てた案: app-server の出力自体を遅らせる。処理完了や runtime truth を遅くするため不採用。捨てた案: CSS animation だけで隠す。実際の読める速度を制御できない。

## merge 後に通す E2E

production PWA で長め turn を観測し、progress checkpoint が一瞬で入れ替わらず、owner が読める速度で出ることを確認する。音声運用に向けて、話速と表示速度の差も owner feedback として残す。

## 次の PR を増やさない理由

この PR は checkpoint pacing の最小実装で閉じる。TTS、voice cadence 設定、最終回答全文の streaming pacing は別 UX surface なので混ぜない。

## 停止条件

checkpoint が表示されなくなる、final summary replacement が壊れる、scroll guard が壊れる、または app-server 実処理を遅らせる必要が出た場合は停止する。
