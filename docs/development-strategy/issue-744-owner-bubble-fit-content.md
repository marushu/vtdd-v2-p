# Issue #744 owner bubble content-width follow-up 作戦図

## 完了体験

iPad / iPhone の Dashboard Butler で owner 発言が見切れず、短い発言は内容幅のまま右寄せで表示され、長い発言・スペースなし日本語・長い URL は現在の最大幅まで広がって折り返される。Butler 返信は #747 で直した full-width 読み幅を維持する。

## VTDD 全体で進める部分

Issue #744 の chat layout slice の follow-up として、#747 の「見切れ防止」を保ったまま owner bubble の過剰な最大幅表示を直す。これは UI polish だけではなく、owner の短文発言が巨大 bubble になって会話の視認性を落とす owner-facing blocker の縮小である。

## 設計

owner message entry は `justify-items: end` のまま維持する。owner bubble は `width: min(720px, 100%)` をやめ、`width: fit-content` と `max-width` を併用する。長文・URL・日本語無空白の崩れを防ぐため、既存の message body wrap / code / link wrapping と `max-width` を維持し、VRT で短文が内容幅に縮むことと長文が潰れないことを同時に見る。

## 仮説

#747 で owner bubble を `width: min(720px, 100%)` にしたため、短文でも常に最大幅の黒 bubble になっている。`fit-content` に戻しても、`max-width` と `overflow-wrap` が残っていれば、前回の縦書き・見切れ問題は再発しない。

## 検証計画

- Unit: Worker HTML に owner bubble の `width: fit-content` と `max-width` が含まれ、旧 `width: min(720px, 100%)` が残らないことを確認する。
- VRT: iPhone / iPad portrait / iPad landscape / iPad real landscape で、owner 短文 bubble が owner entry 全幅より十分小さいことを確認する。
- VRT: owner 長文・スペースなし日本語・長い URL が viewport 外へ見切れず、右寄せのまま表示されることを確認する。
- Local: `node --test test/worker.test.js`
- Local: `npm run e2e:issue744-chat-layout:chromium`
- Local: `npm run check:generated-worker`
- Local: `git diff --check`

## 改修見積もり

- `src/worker/runtime.js`: owner bubble CSS の幅指定を `fit-content` + `max-width` へ変更する。risk は短文改善と長文崩れの両立。
- `worker.js`: generated Worker 更新。
- `scripts/e2e-issue744-dashboard-chat-layout.spec.mjs`: owner short width の regression assertion を追加する。risk は実機との差分だが、少なくとも全幅化退行を防ぐ。
- `test/worker.test.js`: CSS contract expectation を更新する。
- `docs/development-strategy/issue-744-owner-bubble-fit-content.md`: 本作戦図。

## 既に通っている経路

PR #747 は merge/deploy 済みで、owner 発言が iPad 実機で見える状態までは改善した。VRT は iPhone / iPad portrait / iPad landscape / iPad real landscape を持っている。

## 未確認の境界

実機 iPad の最終見た目は deploy 後の owner E2E が必要。Playwright viewport は iPadOS の address bar / keyboard / PWA restore を完全には再現しない。

## 穴が出そうな箇所

`fit-content` がスペースなし日本語を min-content に寄せすぎると縦書きに近い崩れが戻る可能性がある。VRT で no-space Japanese の最小幅を固定する。

## PR 前に確認すること

open PR がないこと、latest `origin/main` から分岐していること、#747 の deploy 後実機 screenshot で短文 bubble 全幅化が確認できていること。

## 実装候補と捨てた案

採用: CSS の owner bubble だけを `fit-content` + `max-width` にする。

捨てた案: owner bubble を全て固定幅にする。短文視認性が悪い。捨てた案: Butler 側 full-width を戻す。#747 の主目的を壊す。

## merge 後に通す E2E

production deploy 後、iPad 実機で短文 owner 発言が内容幅で右寄せ、長文 owner 発言が見切れず、Butler 返信が full-width 読み幅で表示されることを確認する。

## 次の PR を増やさない理由

この PR は #744 の owner bubble 幅だけに絞る。進行ログ折りたたみ、iPad resume、reply preview、Codex usage guard は別 Issue / 別 slice の土台修正であり混ぜない。

## 停止条件

owner 長文や URL が再び見切れる、Butler 返信が narrow column に戻る、VRT が実機で見えている問題を再現できない、または deploy / credential / permission mutation が必要になった場合は停止する。
