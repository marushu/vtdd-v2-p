# Issue #590: 最終返信に進行要約を折りたたんで残す

## 完了体験

Dashboard Butler で長い作業を待つ owner が、作業中は transient progress で現在位置を見られる。作業完了後は progress pane が消えるだけでなく、最終 Butler 返信の下に「進行ログ」として折りたたみ要約が残る。通常チャット履歴には `考えています。` や `コマンドを実行しています。` が個別 message として積み上がらない。

## VTDD 全体で進める部分

Issue #590 の残 blocker である silent wait / long-turn observability を進める。Issue #413 の実行中 progress runtime truth とも接続するが、この PR は Dashboard chat message の owner-facing 表示に限定する。

## 設計

`app_server_status` の transient snapshot に、直近 turn の owner-facing progress text を `progressSummary.entries` として蓄積する。final `app_server_reply` が来た時、snapshot を消す前に progress summary を final Butler message の payload に添付する。

UI は Butler message の本文下に `<details>` を追加し、summary label は `進行ログ` とする。message 本文や copy text には混ぜない。raw chain-of-thought / raw terminal output は保存せず、既存の stage mapping を通った owner-facing 短文だけを残す。

## 仮説

現在は sleep / reconnect 用の transient snapshot があるが、final reply 後に消えるため、owner は作業中に何が起きていたかを後で追えない。progress を durable message として保存すると履歴汚染が戻るため、final reply の補助 payload に集約するのが最小の改善になる。

## 検証計画

- Worker test: 複数の `app_server_status` 後に `app_server_reply` が来ると、最終 Butler message に `progressSummary.entries` が付く。
- Worker test: progress summary 付き final reply 後、transient snapshot は消える。
- Worker test: generic progress は従来通り単独 durable message にならない。
- HTML test: Butler message が `progressSummary.entries` を `<details>` として描画できる。
- `npm run build:worker`
- `npm run check:generated-worker`
- `git diff --check`

## 改修見積もり

- `src/worker/runtime.js`: snapshot schema、final reply への progress summary 添付、Dashboard UI renderer を変更する。リスクは snapshot rowsWritten 増加と final message payload 肥大化。
- `test/worker.test.js`: progress summary regression と UI route assertion を追加する。
- `worker.js`: generated Worker bundle。

## 既に通っている経路

PR #731 で generic progress の durable message 汚染は止まっている。PR #733/#734 系で composer progress pane と reply delta transient 表示の土台が入っている。PR #741/#773 で deploy 後 bridge 復帰導線も進んでいる。

## 未確認の境界

Codex app-server protocol が final answer と progress を完全分離しているわけではない可能性がある。この PR は protocol 解釈を広げず、Worker が受け取った既存 `app_server_status` の owner-facing text だけを扱う。

## 穴が出そうな箇所

- progress を message 本文へ混ぜると、読みづらい長文が再発する。
- raw terminal output を保存すると安全境界が崩れる。
- 件数制限で途中ログを雑に切ると owner が後で追えない。保存は件数ではなく payload safety の文字量で抑える。
- final reply がない stalled / failed は既存 recovery message を優先する。

## PR 前に確認すること

open PR がないこと、`main` が `origin/main` と一致すること、Issue #590 が open であること、active queue の Now が #590 であること、通常 chat progress spam regression が戻らないこと。

## 実装候補と捨てた案

採用: transient snapshot に progress entries を蓄積し、final Butler message に折りたたみ payload として添付する。

捨てた案: progress を全て durable Butler message に戻す。履歴汚染と storage cost が戻る。捨てた案: final message 本文へ progress を連結する。owner が読みにくい。捨てた案: raw delta / raw command output を保存する。安全境界と UX を壊す。

## merge 後に通す E2E

production Dashboard Butler で長めの依頼を送り、途中 progress が composer pane に出ること、完了後に pane が消えること、最終 Butler message 下の `進行ログ` を開くと進行要約を見返せること、通常履歴に progress message が増殖しないことを確認する。

## 次の PR を増やさない理由

この PR は #590 の残 UX のうち「完了後に progress を見返せる」一点に限定する。stop/interrupt、owner input queue、Web Push、#637 privileged helper は別 authority / runtime 境界なので混ぜない。

## 停止条件

raw chain-of-thought / raw terminal output の保存が必要になる、progress が通常 message として増殖する、deploy / credential / permission / destructive work が必要になる、または app-server protocol の final/progress 境界が現在の仮説と矛盾する場合は停止する。
