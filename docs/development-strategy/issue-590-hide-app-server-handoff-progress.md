# Issue #590 hide app-server handoff progress from chat bubbles

## 完了体験

Dashboard Butler PWA の通常 chat 本文には、`Codex app-server に渡しています`、`作業を継続しています。まだ最終回答は生成中です。`、`（続き生成中）` 付きの途中返信断片のような低情報 progress bubble が挟まらない。owner は composer 下の短い `進行中` 表示で待機状態を把握でき、最終返信と必要な owner action だけを chat 本文として読める。

## VTDD 全体で進める部分

Issue #590 の owner-facing long-turn observability を進める。PR #808 で auto-scroll は撤回済みだが、添付画像で低情報 progress が BUTLER bubble として残ることが確認された。今回は Dashboard chat 履歴汚染の除去に限定する。

## 設計

Dashboard Butler owner-facing surface では、handoff / long-turn heartbeat / reply delta は transient progress card に留める。`transient_progress_snapshot.progressSummary.entries` は chat 本文の checkpoint bubble として描画されるため、低情報 source/text を summary entry に入れない。reply delta は途中本文を見せず `応答を生成しています。` の汎用 transient status に正規化する。最終返信への progress summary 添付や waiting approval / waiting user input の owner action は壊さない。

## 仮説

原因仮説は、`broadcastTransientStatus({ snapshot: true, snapshotSource: "owner_message_dispatch" })`、`long_turn_checkpoint`、`app_server_reply_delta` が `buildDashboardProgressSummarySnapshot()` で summary entry 化され、thread refresh / transient status restore 時に `renderThreadProgressCheckpoint()` が通常 BUTLER bubble として表示していること。bridge 側の `（続き生成中）` は途中本文をユーザーに読ませるので、通常 chat 本文には不適切。

## 検証計画

- Unit: owner message dispatch の transient status は送るが、snapshot progress summary には usage handoff 文言を入れない。
- Unit: long-turn checkpoint は transient-only で、通常 chat bubble / progressSummary entry にならない。
- Unit: app-server reply delta は durable chat / progressSummary entry にならず、途中本文や `（続き生成中）` ではなく汎用 transient status だけを送る。
- Source assertion: Dashboard HTML の checkpoint renderer は残るが、低情報 handoff 文言は summary entry 対象外。
- Existing targeted: `node --test test/worker.test.js --test-name-pattern 'DashboardChatRoom|dashboard|progress|composer|summary'`
- Worker build: `npm run build:worker` / `npm run check:generated-worker`
- E2E: `npx playwright test scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs --browser=chromium --reporter=line`

## 改修見積もり

- `src/worker/runtime.js`: progress summary entry inclusion guard と reply delta transient text 正規化。risk は有用な progress checkpoint まで消すこと。
- `test/worker.test.js`: handoff / long-turn transient-only regression。risk は既存 #590 checkpoint tests の期待更新漏れ。
- `scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs`: mobile evidence に handoff bubble absence を残す。risk は source assertion 過多。
- `worker.js`: generated worker 同期。
- `docs/development-strategy/issue-590-hide-app-server-handoff-progress.md`: この作戦図。

## 既に通っている経路

PR #731 以降で generic progress の durable chat message 化は止めた。PR #808 で progress auto-scroll は撤回済み。Composer 下の transient progress card は既に表示されるため、chat bubble に低情報 progress を残す必要はない。

## 未確認の境界

production PWA で既存の stale client / service worker が古い renderer を持つ場合、deploy 後に強制 refresh または freshness check が必要になる可能性がある。

## 穴が出そうな箇所

progress summary を絞りすぎると、owner action が必要な `waiting_approval` / `waiting_user_input` まで見えなくなる。今回の exclusion は owner handoff / long-turn heartbeat / reply delta の低情報 source/text に限定する。

## PR 前に確認すること

Issue #590 が Now root blockerであること、PR #808 が merged で merged branch へ追加 push しないこと、fresh `origin/main` から branch を切ったこと、添付画像の localPath evidence を確認する。

## 実装候補と捨てた案

採用: `buildDashboardProgressSummarySnapshot()` の entry inclusion を source/text で絞り、handoff / long-turn heartbeat を transient-only にする。

捨てた案: checkpoint renderer 全体を削除する。有用な owner-facing progress まで消えるため広すぎる。

捨てた案: app-server bridge から文言を送らない。bridge protocol 変更になり、この UI 汚染の最小修正ではない。

## merge 後に通す E2E

production PWA live E2E で長い app-server turn を走らせ、`Codex app-server に渡しています`、`作業を継続しています。まだ最終回答は生成中です。`、`続き生成中` が通常 chat bubble に出ないこと、composer 下の progress は残ること、最終返信は同じ thread に入ることを検証する。

## 次の PR を増やさない理由

添付画像で見えている読みづらさは同じ #590 chat履歴汚染の一点で、source/text inclusion guard の同じ境界に収まる。#637 helper link や stop/interrupt は別の authority / UX 問題なので混ぜない。

## 停止条件

waiting approval / waiting user input の owner action 表示が消える、final reply が消える、通常 chat 履歴に低情報 progress が戻る、または deploy / credential / permission / destructive work が必要になる場合は停止する。
