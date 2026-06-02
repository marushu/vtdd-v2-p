# Issue #590: transient progress card and final-summary-only history

## 完了体験

Dashboard Butler で長めの開発を実行している間、owner は通常チャット履歴とは別の作業中カードで「今なにをしているか」を見られる。`考えています。` / `コマンドを実行しています。` / `ファイル変更を確認しています。` のような進行表示は同じカードを更新し、通常メッセージとして積み上がらない。完了時はカードが消え、履歴には最終回答、失敗、承認待ち、確認待ちなど後から読む意味があるものだけが残る。

## VTDD 全体で進める部分

Issue #590 の残 blocker である owner-facing observability を進める。PR #731 で durable chat history の低情報 progress 汚染は止まったが、owner の観測では進行表示が逐次見えず、最後に連結文として残る UX がまだ失敗している。今回は Dashboard Butler PWA の transient UI 表示を通常チャット履歴から分離する。

## 設計

Worker の `transient_status` WebSocket payload は既存のまま使う。Dashboard PWA の DOM に transient progress 専用 article を 1 個だけ作り、`transient_status` の `thinking` / `stalled` / `pending_app_server_bridge` などで同じ article を更新する。

カードは `chat-scroll` 内の末尾に表示するが、`messagesById` には入れない。`thread` message の render 時は一度カードを取り外し、履歴を再描画してから必要なら末尾へ戻す。final reply / failed / stalled persistent message を受けたらカードを消し、履歴に通常の最終メッセージだけを残す。

composer 下の短い status は接続状態や送信確認に使い続ける。ただし長い作業中 progress の主要表示は progress card に移す。

## 仮説

仮説: 現在は transient progress が composer status の短文にしか出ないため、owner が長い作業中の状態を追えない。さらに app-server / Codex 側の commentary が最終 reply としてまとまって返ると、progress と final answer の境界が崩れる。PWA に transient progress card を作れば、逐次 progress は履歴に残さず見えるようになり、最終 reply は通常メッセージとして読みやすく残せる。

## 検証計画

- Unit: dashboard HTML に transient progress card helper が含まれること。
- Unit: `transient_status` handler が `updateTransientProgress(...)` を呼び、final thread reply / failed / stalled message で `clearTransientProgress()` を呼ぶこと。
- E2E-518: transient status が generic chat spam にならず、progress card 更新経路を持つこと。
- Integration: `node --test test/worker.test.js`、`node --test test/e2e-518-dashboard-chat-transient-timestamps.test.js`、`npm run build:worker`、`npm run check:generated-worker`、`git diff --check`。

## 改修見積もり

- `src/worker/runtime.js`: Dashboard chat CSS / HTML / client JS に progress card helper と transient handler を追加する。
- `test/worker.test.js`: HTML/JS route が progress card helper と final cleanup path を含むことを確認する。
- `test/e2e-518-dashboard-chat-transient-timestamps.test.js`: transient status evidence を progress card 経路へ更新する。
- `docs/mvp/e2e/e2e-518-dashboard-chat-transient-timestamps.md`: evidence wording を更新する。
- `worker.js`: generated worker bundle。

## 既に通っている経路

PR #731 で generic progress は durable thread message へ保存されなくなった。PR #732 でその production evidence は execution queue に反映済み。Worker は `transient_status` payload を Dashboard WebSocket へ送る経路を既に持つ。

## 未確認の境界

実 iPhone/iPad PWA でのカード視認性、keyboard 表示時の配置、長文 progress の省略具合は production E2E 後に確認する。raw chain-of-thought や raw terminal output は出さない。

## 穴が出そうな箇所

- progress card を通常 message と同じ Map に入れると履歴汚染が戻る。
- thread 再描画時に card を失うと進行が見えない。
- final reply 後に card が残ると二重表示になる。
- status 下部と card の両方に長文を出すと UI がうるさい。

## PR 前に確認すること

Issue #590、PR #731、PR #732、`src/worker/runtime.js` の Dashboard ChatRoom / client JS、`test/worker.test.js`、`test/e2e-518-dashboard-chat-transient-timestamps.test.js` を確認する。

## 実装候補と捨てた案

採用: chat-scroll 末尾に transient progress card を 1 個だけ表示し、progress event で置換更新する。

捨てた案: progress を durable message に戻す案、composer status だけで済ませる案、raw commentary をそのまま保存する案、bridge 側で全 progress を final summary に変換する案。

## merge 後に通す E2E

Production Dashboard Butler PWA で長めの依頼を送り、進行中は transient progress card が更新され、通常チャット履歴に低情報 progress が増えず、完了後に card が消えて最終回答だけが残ることを確認する。

## 次の PR を増やさない理由

この PR は PR #731 後の残 blocker である PWA transient progress 表示に限定する。final answer の文章品質や Issue #637 privileged maintenance へ広げると検証境界が壊れる。

## 停止条件

raw chain-of-thought / raw terminal output を表示する必要が出た場合、durable chat history へ progress が戻る場合、deploy / credential / permission / destructive work が必要になる場合は停止する。
