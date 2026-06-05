# Issue #590 最終要約整形 作戦図

## 完了体験

Owner が Dashboard Butler PWA / iPhone で長めの作業完了後に最終回答を見る時、本文が長文ベタ出しにならず、結論、変更契約、検証、境界、次の行動をすぐ識別できる。進行ログは補助情報として控えめに残り、最終まとめ本文より強く見えない。

## VTDD 全体で進める部分

Issue #590 の Now を継続する。今回の slice は production evidence で確認された completion summary replacement の可読性不足に限定し、#637 の VPS privileged maintenance 実装には戻らない。PR #799 の deploy / bridge restart 後に見えた UI blocker を、次の小さな #590 UI slice として扱う。

## 設計

Dashboard message renderer は通常の最終回答本文を `renderMessageText()` で段落化している。現状は Markdown 見出しでない短い節見出しや `対象:` / `検証:` のような契約行が通常段落に混ざるため、iPhone ではどこからが要約でどこからが契約か分かりにくい。

今回は最終回答の HTML 生成時に、短い日本語/英語の節見出しとコロン区切りの契約行を軽量に検出し、`summary-section-title` / `summary-key-value` として表示する。Markdown パーサや LLM 出力内容は変えず、既存のリンク・コード・箇条書きレンダリング境界を壊さない。

進行ログの visual weight は既存 Issue コメントに従い、強い panel 感を下げる。背景と border を弱め、本文より補助情報として見えるようにする。

## 仮説

対象ファイルは `src/worker/runtime.js` の Dashboard CSS と `renderMessageText()` 周辺、生成済み `worker.js`、および `test/worker.test.js`。最終要約が読みにくい主因は、message body 内で短い節見出しを段落と同じ扱いにしていることと、進行ログ block の装飾が強いことにある。

狭く CSS だけを触ると、画像で見えている `変更契約` のような区切りが本文中に埋もれる問題は残る。逆に LLM 出力形式を強制すると Butler / app-server 側の自然会話を壊す。したがって renderer 側で既存テキストをセマンティックに少し整形するのが最小変更になる。

## 検証計画

- Unit: `node --test test/worker.test.js --test-name-pattern 'dashboard|DashboardChatRoom|progress|composer|summary'`
- Build: `npm run build:worker`
- Generated worker: `npm run check:generated-worker`
- Diff hygiene: `git diff --check`
- E2E: `npx playwright test scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs --browser=chromium --reporter=line`

## 改修見積もり

- `src/worker/runtime.js`: message body CSS に final summary section / key-value の表示ルールを追加する。リスクは通常チャット本文の過剰整形。
- `src/worker/runtime.js`: `renderMessageText()` の行処理に短い節見出しと `key: value` 行の検出を追加する。リスクは URL や長文コロンを誤検出すること。
- `src/worker/runtime.js`: `.progress-summary` の visual weight を下げる。リスクは進行ログが薄すぎて読めなくなること。
- `worker.js`: worker bundle 更新。リスクは生成差分の取り込み漏れ。
- `test/worker.test.js`: Dashboard shell と renderer 断片のテストを更新する。リスクは文字列検査が実装に寄りすぎること。

## 既に通っている経路

PR #799 で paced progress checkpoint rendering は merge / deploy 済み。Deploy workflow `27004369098` は merge SHA `27466105f5964cf733bbde7c6b79c275bf26f40a` で success。Owner は deploy と bridge restart 完了を報告済み。

## 未確認の境界

production PWA の最終回答が常に同じ文体とは限らない。今回の検出は短い節見出しと明確なコロン区切りに限定し、曖昧な本文を無理に再構造化しない。

## 穴が出そうな箇所

日本語本文中の自然なコロン、URL、Windows path、コード行を key-value と誤認すると読みにくくなる。検出は短い key と空白を含まない記号列に寄せ、既存 Markdown リンクや inline code の処理を優先する。

## PR 前に確認すること

branch が latest `origin/main` から作られていること。`.tmp/` と `test-results/` を commit しないこと。Issue #590 への evidence コメントは実装 PR とは別に事実として残すこと。

## 実装候補と捨てた案

採用候補は renderer 側の軽量 section / key-value 整形。捨てた案は、app-server 側 prompt で final answer の Markdown 化を強制する案と、進行ログだけ CSS で薄くする案。前者は出力生成に寄りすぎ、後者は `変更契約` が埋もれる本題を解決しない。

## merge 後に通す E2E

production deploy 後、owner が iPhone PWA で最終要約を確認し、結論・変更契約・検証・次の行動が視覚的に分かれることを確認する。進行ログは補助情報として強すぎないことも確認する。

## 次の PR を増やさない理由

今回の変更は同じ owner-facing completion summary replacement surface に閉じており、CSS と renderer の小さな協調が必要。docs-only と runtime を分けると evidence と実装の対応がかえって追いにくい。

## 停止条件

renderer 変更が通常チャット本文やコードブロックを壊す兆候が出た場合は停止する。Issue #590 以外の進行制御、deploy automation、#637 実行に踏み込む必要が出た場合も停止する。
