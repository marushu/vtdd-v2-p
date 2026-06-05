# Issue #590 gentle progress auto-scroll

## 完了体験

Dashboard Butler の長い turn 中、owner が最下部付近で待っている場合は、live progress checkpoint の続きが入力欄に隠れたままにならず、会話を読む速度に近いゆっくりした下方向スクロールで追従する。owner がトラックパッド、タッチ、ホイール、画面スクロールで読書中の場合は自動スクロールを止め、操作が止まってからだけ追従を再開する。

## VTDD 全体で進める部分

Issue #590 の owner-facing observability を進める。これは silent wait recovery の一部であり、Issue #637 helper 通知 URL、内部 lifecycle ログのチャット本文流出、deploy/restart automation はこの PR では扱わない。

## 設計

既存の `isNearLatest()` / `scrollToLatestIfFollowing()` は、読書中に下へ戻さない guard として有効だが、live progress が増え続けるケースでは「最下部付近にいた owner が何も操作していないのに、続きが入力欄下へ隠れる」問題が残る。通常の final reply append は既存の即時追従を維持し、progress checkpoint / thread refresh の follow path だけに gentle follow を追加する。

## 仮説

`src/worker/runtime.js` の Dashboard client script で、progress update 後に `scrollToLatestIfFollowing(shouldFollow)` が即時 `scrollToLatest()` を呼ぶため、読書中は止められる一方で、進行文の pacing 中に少しずつ伸びる DOM 高さへの追従が単発で終わる。人間操作時刻を記録し、操作停止後に短い interval で `scrollBy()` すれば、文章の続きが自然に見える。

狭く `scrollTop = scrollHeight` を繰り返すだけだと、owner の手動スクロールを奪う。逆に自動追従を完全に止めると、今回の iPad / iPhone 観測のように続きが読めない。

## 検証計画

- Source assertion: gentle follow helper、human interaction guard、progress render からの呼び出しが Dashboard HTML に含まれる。
- E2E: mobile viewport で progress 更新時、owner がスクロール中の位置は保持される。
- E2E: owner 操作が無い最下部付近では、progress 更新後に `scrollTop` がゆっくり増える。
- Existing targeted: `node --test test/worker.test.js --test-name-pattern 'dashboard|DashboardChatRoom|progress|composer|summary'`
- Worker build: `npm run build:worker` / `npm run check:generated-worker`
- E2E: `npx playwright test scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs --browser=chromium --reporter=line`

## 改修見積もり

- `src/worker/runtime.js`: Dashboard client script の scroll helper 周辺。risk は通常 reply append の auto-scroll 退行。
- `test/worker.test.js`: HTML source assertion。risk は文言変更に弱いテスト。
- `scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs`: 既存 mobile progress E2E に gentle follow 観測を追加。risk はブラウザタイミング依存。
- `worker.js`: generated worker 同期。

## 既に通っている経路

PR #801 までで live progress checkpoint は複数 card として積まれ、先頭文脈も残る。PR #799 で pacing が入り、PR #796 / #797 で composer 下の `進行中` 高さは抑えられている。Issue #590 には読書中スクロールを奪う evidence が既に記録されている。

## 未確認の境界

実機 iOS PWA の `scrollBy({ behavior: "smooth" })` の細部はローカル Playwright だけでは完全には一致しない。したがって PR 後の production PWA evidence は必要。

## 穴が出そうな箇所

人間操作検知が弱いと、owner が読んでいる最中に追従が再開する。強すぎると、何も触っていないのに追従しない。`wheel`、`touchstart`、`touchmove`、`pointerdown`、`keydown`、`scroll` を記録し、programmatic scroll 中だけ `scroll` を人間操作扱いしない。

## PR 前に確認すること

`origin/main` から topic branch を切る。local `main` の branch bounce 汚染はこの PR に混ぜない。`.tmp/` と `test-results/` は含めない。

## 実装候補と捨てた案

採用: progress / refresh follow path に `scheduleGentleScrollFollow()` を追加する。

捨てた案: 全 `scrollToLatest()` を smooth にする。owner message 送信や final reply 表示の既存期待まで変わるため、この slice には広すぎる。

捨てた案: 常時 auto-scroll。Issue #590 の読書中 scroll theft evidence に反する。

## merge 後に通す E2E

production PWA で長い app-server turn を走らせ、owner が画面を触らない場合は live progress の続きがゆっくり見えること、スクロール操作中は追従しないことを確認する。

## 次の PR を増やさない理由

今回の owner input は既存 #590 scroll guard の対になる挙動で、同じ helper 境界に収まる。内部 lifecycle ログ除去や #637 helper link は別の表示分類問題なので混ぜない。

## 停止条件

通常 final reply の表示が追従しなくなる、読書中に下へ戻される、progress card が消える、または generated worker と source が同期できない場合は停止する。
