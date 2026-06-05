# Issue #590 bridge lifecycle progress を控えめにする作戦図

## 完了体験

Owner が Dashboard Butler PWA で bridge restart 後の通常チャットを見た時、`thread resume` や `turn start` の technical lifecycle truth は確認できるが、通常回答や重要 checkpoint より目立たない。画面を大きく占有せず、必要なら流し読みできる。

## VTDD 全体で進める部分

Issue #590 の owner-facing progress lane を改善する。Issue #741 の bridge lifecycle truth は関連するが、今回の slice は restart 実行や lifecycle guard の拡張ではなく、既に届く lifecycle event の表示分類だけを扱う。

## 設計

`app_server_status` の `stage=thread_resume` / `turn_started` / `bridge_connected` は復帰 truth として有用だが、owner-facing progress checkpoint と同じ `Butler` bubble で出すには technical すぎる。Worker 側で snapshot source を lifecycle 専用にし、Dashboard renderer 側で `bridge-lifecycle-checkpoint` class を付け、文言も短くする。

## 仮説

表示がうるさい原因は、bridge lifecycle event が `app_server_status` として一般 progress summary に入り、`progress-checkpoint-bubble` の通常 Butler bubble と同じ header / text size / color で表示されることだと疑っている。source と stage を分類すれば、runtime truth は残しつつ visual weight を下げられる。

## 検証計画

- Unit: `node --test test/worker.test.js --test-name-pattern 'dashboard|DashboardChatRoom|progress|composer|lifecycle'`
- Unit: `node --test test/dashboard-app-server-bridge.test.js`
- Build: `npm run build:worker`
- Generated worker: `npm run check:generated-worker`
- Hygiene: `git diff --check`
- E2E: `npx playwright test scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs --browser=chromium --reporter=line`

## 改修見積もり

- `src/worker/runtime.js`: bridge lifecycle stage 判定、snapshot source 分類、短い lifecycle text、muted note CSS / DOM class を追加する。
- `test/worker.test.js`: lifecycle status が generic owner-facing checkpoint ではなく muted lifecycle checkpoint として扱われることを確認する。
- `worker.js`: generated Worker bundle を更新する。

## 既に通っている経路

PR #801 / #802 で live checkpoint stack と VPS operator URL context は merge 済み。bridge restart post-step は #741 runtime truth として issue comments に残る。ただし owner は production PWA で lifecycle checkpoint が強すぎることを観測した。

## 未確認の境界

production PWA で実際にどの lifecycle event が何件出るかは bridge restart timing に依存する。今回の変更は stage/source で絞り、通常 implementation/test/reviewer checkpoint には適用しない。

## 穴が出そうな箇所

lifecycle event を完全に消すと、restart 後に文脈が復帰した証拠が owner-facing に消える。逆に通常 progress と同じ見た目のままだと chat がうるさくなる。短い muted note でバランスを取る。

## PR 前に確認すること

`origin/main` から topic branch を作ること。local `main` の未同期 commit や `.tmp/` / `test-results/` を巻き込まないこと。#590 / #741 の既存 comments と queue truth を読むこと。

## 実装候補と捨てた案

採用候補は lifecycle stage を snapshot source と CSS class で分ける案。捨てた案は lifecycle event を完全に非表示にする案と、bridge script の event 自体を止める案。前者は復帰 truth を失い、後者は #741 の lifecycle evidence を弱める。

## merge 後に通す E2E

production deploy / cache reload 後、Dashboard Butler PWA で bridge restart 復帰時の lifecycle note が通常 Butler bubble より控えめに見えることを iPhone/PWA live E2E で確認する。

## 次の PR を増やさない理由

この slice は同じ #590 progress lane の表示分類内で完結する。bridge restart 実行、通知未達、#741 lifecycle guard の拡張は別 Issue の残作業として残し、ここで混ぜない。

## 停止条件

通常の owner-facing checkpoint が薄くなる、bridge lifecycle truth が完全に見えなくなる、または Durable Object write が増える実装になりそうな場合は停止する。
