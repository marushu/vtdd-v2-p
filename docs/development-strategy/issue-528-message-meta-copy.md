# Issue #528 チャット時刻とコピー導線の外出し作戦図

## 完了体験

Dashboard Butler の通常チャットで、各メッセージのコピー導線が hover しないと見えない状態ではなく、時刻の横に常時表示される。時刻は bubble 内ではなく bubble 外の補助行に出る。Owner は iPad/iPhone/PWA でも「どの発言をいつ送ったか」と「コピーする場所」を探さず使える。

## VTDD 全体で進める部分

Issue #528 の ChatGPT iOS 相当チャット UX baseline のうち、message rendering の時刻/コピー導線を改善する。debug/ops 隔離、添付 UX、進行表示、reconnect はこの PR では扱わない。

## 設計

`appendMessage` が `article.bubble` だけを直接 `chat-scroll` に追加する構造を、`div.message-entry` 内に `article.bubble` と `div.message-actions` を持つ構造へ変える。`message-actions` には `time.message-meta` と `button.copy-message` を置き、コピー button は常時表示する。

Owner 発言は右寄せ、Butler/System 発言は左寄せの entry とし、bubble 内本文の読みやすさを保つ。code block の copy button は既存通りコードブロック内の操作として残す。

## 仮説

原因は `src/worker/runtime.js` の `.copy-message` が bubble 内で absolute 配置かつ hover/focus/click reveal 前提になっていること。さらに `time.message-meta` が bubble 内に append されているため、ChatGPT/Codex 風の「本文外の補助行」になっていない。

`appendMessage` だけで構造を変えれば、WebSocket replay や `log.replaceChildren(fragment)` の履歴再構築にも同じ表示を適用できると予測する。

## 検証計画

- `test/worker.test.js`: `message-entry` / `message-actions` / 常時表示 copy button / bubble 外 meta の HTML/JS/CSS 存在を確認する。
- `node --test test/worker.test.js`: Dashboard HTML smoke と既存 Worker route を確認する。
- `npm run build:worker`: generated `worker.js` を更新する。
- `npm run check:generated-worker`: generated worker の整合性を確認する。
- `git diff --check`: whitespace と patch 事故を確認する。

## 改修見積もり

- `src/worker/runtime.js`: `.message-entry` / `.message-actions` CSS、`.copy-message` CSS、`appendMessage` の DOM 構造、copy helper の生成位置を変更する。
- `test/worker.test.js`: hover 表示前提の assertion を常時表示 + outside meta 前提に変更する。
- `worker.js`: generated worker として同じ commit に含める。

## 既に通っている経路

- `copyMessageText` と `navigator.clipboard.writeText` 経路は既に存在する。
- `formatMessageTimestamp` は locale-aware に時刻を整形している。
- code block 用 `.copy-code` は独立して存在し、今回の message copy 移動とは分離できる。

## 未確認の境界

- production iPhone/iPad PWA で、entry 外出し後の行間、右寄せ owner bubble、長文メッセージ、スクロール位置が期待通りかは merge/deploy 後 E2E が必要。
- PR #736 の添付 lightbox PR が merge された後、同じ `runtime.js` 変更との conflict 可能性がある。

## 穴が出そうな箇所

- `appendMessage` が target に fragment を使うため、entry wrapper を append する時も scroll/replay が壊れないようにする必要がある。
- copy button を bubble 外に出すと、owner bubble の濃色背景に依存していた配色が読みにくくなる可能性がある。
- hover reveal 用の `attachMessageActionReveal` を残すと、不要な state と click toggling が残って UX が混乱する。

## PR 前に確認すること

- Issue #528 の Success Criteria と Non-goals を読む。
- PR #736 が open / reviewer blocked のため混ぜないことを確認する。
- `src/worker/runtime.js` の `appendMessage`、`.copy-message`、`.message-meta`、`test/worker.test.js` の旧 assertion を確認する。
- local tests、build、generated check、diff check を通す。

## 実装候補と捨てた案

- 採用: bubble 外に `message-actions` を置き、時刻と copy button を常時表示する。
- 捨てた案: hover 表示を少し濃くするだけ。iPad/iPhone では hover 前提が残り、owner の要件を満たさない。
- 捨てた案: bubble 内 footer に時刻と copy を入れる。本文内に操作要素が残り、ChatGPT/Codex 風の補助行にならない。

## merge 後に通す E2E

- Production PWA E2E として、owner 発言、Butler 返信、system message で時刻が bubble 外に出ることを検証する。
- 各 message の時刻横に copy button が常時表示され、hover なしで押せることを検証する。
- 長文/コードブロック/添付付き message でも本文と補助行が重ならないことを検証する。

## 次の PR を増やさない理由

コピー導線と時刻位置は同じ message rendering の構造問題なので、一つの PR にまとめる。添付、進行表示、入力中ナビ、debug/ops 隔離は別 Issue/PR のまま残す。

## 停止条件

- ChatGPT/Codex 完全再現のために大きな component rewrite が必要になった場合は停止する。
- 添付 lightbox、transient progress、reconnect、deploy/operator UI に広がる場合は停止する。
- deploy、credential、permission、destructive operation が必要な場合は passkey approval 境界として停止する。
