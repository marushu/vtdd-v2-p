# Issue #590: inline transient progress text

## 完了体験

Dashboard Butler で長めの依頼を投げた owner が、入力欄上の軽い一時表示で「いま何を考え、どこを確認しているか」を読める。表示は通常チャット履歴には保存されず、完了後は最終回答だけが履歴に残る。緑の点滅などの短い activity signal は残しつつ、進行文は薄い文字色の inline progress として区別する。

## VTDD 全体で進める部分

Issue #590 の残 blocker である owner-facing observability を進める。PR #733 の transient progress card は履歴汚染を止める受け皿だったが、owner 観測では「コマンドを実行しています」程度の短文だけで、Codex が実際にどの仮説で何を見ているかが読めなかった。今回は card 型ではなく composer 上の inline progress pane に寄せる。

## 設計

`item/agentMessage/delta` は通常履歴には入れないまま、Dashboard runtime の `transient_status` としても流す。PWA 側は chat log 内の card ではなく、composer 内の pending media と composer box の間に 1 個だけある inline progress pane を更新する。

## 仮説

現在の bridge は `item/agentMessage/delta` を `app_server_reply_delta` として送るが、runtime はそれを transport progress として捨てる。そのため owner には low-information status だけが見え、考えている文章は turn 完了時に final reply と一緒に連結される。reply delta を transient text としても broadcast すれば、作業中に薄い進行文として読める。

## 検証計画

- Unit: app-server bridge の reply delta event が accumulated progress text を持つこと。
- Unit: Worker runtime が `app_server_reply_delta` を `transient_status: thinking` に変換すること。
- Unit: Dashboard HTML が composer inline progress pane を持ち、final reply / failed / stalled で clear すること。
- Integration: `npm run build:worker` と generated worker check。
- E2E: production Dashboard PWA で長めの read-only 依頼を送り、進行文が入力欄上に薄く表示され、通常履歴に積み上がらないことを owner 観測で確認する。

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`: `app_server_reply_delta` に final accumulation とは別の transient progress text を載せる。risk は delta が多い turn で表示更新頻度が増えること。
- `src/worker/runtime.js`: `app_server_reply_delta` を transient-only event として扱う。risk は final reply 用 durable message と混線しないよう messages を空のままにすること。
- `src/worker/runtime.js`: progress UI を chat-scroll card から composer inline pane に寄せる。risk は mobile composer 高さと keyboard 周り。
- `test/dashboard-app-server-bridge.test.js` / `test/worker.test.js`: mapping と HTML route evidence を更新する。
- `worker.js`: generated worker を同期する。

## 既に通っている経路

PR #731 で low-information progress は durable chat history を汚染しなくなった。PR #733 で transient progress card の受け皿は production deploy 済み。

## 未確認の境界

Codex app-server が final answer と commentary/progress を protocol 上で明確に分けているかは未確認。もし分かれていない場合、この PR 後も final reply に途中ログが混ざる可能性がある。その場合は次 slice で final 抽出 / progress 除外ルールを bridge 側に追加する。

## 穴が出そうな箇所

- delta をそのまま表示すると断片的すぎる。
- accumulation を無制限に表示すると composer 周辺が重くなる。
- card を chat log に残すと owner が望む「入力欄上の軽い表示」から外れる。
- progress 更新時に chat log を最下部へ scroll すると、owner が過去ログを読んでいる最中に位置が奪われる。
- final reply に progress が混ざる問題は、今回の transient visibility だけでは完全に閉じない可能性がある。

## PR 前に確認すること

`Issue #590` が Now のままであること、open PR が衝突していないこと、local branch が `main` でないこと、runtime tests と generated worker check が通ること。

## 実装候補と捨てた案

採用: composer 上の inline progress pane を 1 個だけ更新し、reply delta の accumulated progress text を transient-only で流す。

捨てた案: chat log 内の card を強化する。owner が「カード型である必要はない」と明言しており、通常履歴と見た目が近くなるため捨てる。

## merge 後に通す E2E

Owner PWA で長めの read-only 依頼を送る。途中は入力欄上の薄い progress text が更新され、完了後は progress pane が消え、履歴には最終要約だけが残ることを確認する。

## 次の PR を増やさない理由

UI の表示位置変更と reply delta の transient 配信は同じ owner-facing symptom の両側であり、片方だけでは今回の観測不満を解消しない。

## 停止条件

app-server protocol が final / progress を区別するフィールドを持つことが判明し、現在の accumulation 方針と矛盾する場合は、既存テストを書き換えずに止めて設計を更新する。
