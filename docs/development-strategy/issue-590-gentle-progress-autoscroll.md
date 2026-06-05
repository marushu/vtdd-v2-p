# Issue #590 gentle progress auto-scroll rollback

## 完了体験

Dashboard Butler の長い turn 中、live progress checkpoint が更新されても、owner の読んでいる位置を勝手に下へ動かさない。最終返信や明示的な follow が必要な通常 append は既存どおり最下部へ移動してよいが、progress の pacing / checkpoint 更新だけでゆっくり下へ追従する挙動は出さない。

## VTDD 全体で進める部分

Issue #590 の owner-facing observability を進める。PR #803 の「ゆっくり追従」は、実運用では progress を読ませるより操作を奪う体験になったため撤回する。Issue #637 helper 通知 URL、内部 lifecycle ログのチャット本文流出、deploy/restart automation はこの PR では扱わない。

## 設計

既存の `isNearLatest()` / `scrollToLatestIfFollowing()` は、通常の final reply append や明示 follow では有効である。一方で `scheduleGentleScrollFollow()` は progress checkpoint の DOM 高さが伸びるたびに画面を動かし続けるため、owner の読書位置を安定させない。progress checkpoint / thread refresh の follow path から gentle follow を外し、`scrollToLatestIfFollowing()` は即時 follow か no-op だけに戻す。

## 仮説

`src/worker/runtime.js` の Dashboard client script で、PR #803 が追加した `scheduleGentleScrollFollow()` と `scrollToLatestIfFollowing(shouldFollow, { gentle: ... })` が、progress update のたびに下方向 scroll を予約している。owner feedback ではこの「ゆっくりスクロール」が使いづらいため、仮説は外れた。

狭く timer interval だけを調整すると、scroll theft の根本は残る。progress checkpoint はその場で更新し、owner が必要なら自分で読む位置を動かせる方が ChatGPT iOS 的な期待に近い。

## 検証計画

- Source assertion: gentle follow helper と progress render からの gentle 呼び出しが Dashboard HTML から消える。
- E2E: mobile viewport で progress 更新時、owner がスクロール中の位置は保持される。
- Existing targeted: `node --test test/worker.test.js --test-name-pattern 'dashboard|DashboardChatRoom|progress|composer|summary'`
- Worker build: `npm run build:worker` / `npm run check:generated-worker`
- E2E: `npx playwright test scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs --browser=chromium --reporter=line`

## 改修見積もり

- `src/worker/runtime.js`: Dashboard client script の scroll helper 周辺。risk は通常 reply append の auto-scroll 退行。
- `test/worker.test.js`: HTML source assertion。risk は文言変更に弱いテスト。
- `scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs`: 既存 mobile progress E2E から gentle follow 要求を外し、progress update が scroll 位置を保持することを evidence に残す。risk はブラウザタイミング依存。
- `worker.js`: generated worker 同期。

## 既に通っている経路

PR #801 までで live progress checkpoint は複数 card として積まれ、先頭文脈も残る。PR #799 で pacing が入り、PR #796 / #797 で composer 下の `進行中` 高さは抑えられている。Issue #590 には読書中スクロールを奪う evidence が既に記録されている。

## 未確認の境界

実機 iOS PWA で progress card / checkpoint の視認性が十分かはローカル Playwright だけでは完全には一致しない。したがって PR 後の production PWA evidence は必要。

## 穴が出そうな箇所

`scrollToLatestIfFollowing()` の signature を戻す時に通常 final reply の追従まで壊すと、完了返信が入力欄下に隠れる。progress checkpoint の更新は scroll 位置を保持しつつ、明示的な `scrollToLatest()` 呼び出しは残す。

## PR 前に確認すること

`origin/main` から topic branch を切る。local `main` の branch bounce 汚染はこの PR に混ぜない。`.tmp/` と `test-results/` は含めない。

## 実装候補と捨てた案

今回採用: progress / refresh follow path から `scheduleGentleScrollFollow()` を外し、gentle timer を削除する。

捨てた案: PR #803 の gentle scroll を継続する。owner feedback で「使いづらい」と判明したため捨てる。

捨てた案: 全 `scrollToLatest()` を smooth にする。owner message 送信や final reply 表示の既存期待まで変わるため、この slice には広すぎる。

捨てた案: 常時 auto-scroll。Issue #590 の読書中 scroll theft evidence に反する。

## merge 後に通す E2E

production PWA で長い app-server turn を走らせ、live progress 更新中に画面が勝手にゆっくり動かないこと、通常最終返信は読める位置へ戻ること、通常 chat 履歴に低情報 progress が増えないことを確認する。

## 次の PR を増やさない理由

今回の owner input は PR #803 で入れた同じ helper 境界の撤回であり、別 PR に分けると使いづらい production UX を残す。内部 lifecycle ログ除去や #637 helper link は別の表示分類問題なので混ぜない。

## 停止条件

通常 final reply の表示が追従しなくなる、progress checkpoint が表示されなくなる、通常 chat 履歴に低情報 progress が戻る、または generated worker と source が同期できない場合は停止する。
