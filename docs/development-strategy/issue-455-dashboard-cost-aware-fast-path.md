# Issue #455 Dashboard cost-aware fast path strategy

## 完了体験

owner が Dashboard Butler で「今の状況」「次は？」「PR/Issue の状態を見たい」のような read/status 系の軽い依頼を投げた時、Butler はまず Codex app-server turn を起動せず、チャット上に「この応答は軽量 read/status fast path で、Codex usage を消費していない」ことを返す。実装・修正・merge・deploy・reviewer などの重い作業は従来通り app-server / runner / reviewer 経路へ進み、品質 gate は削らない。

2026-06-03 follow-up: fast path は owner-facing 返答の主役にしてはいけない。`cost_boundary` や `codexWillStart=false` は補足情報であり、先頭本文は owner の質問に答える必要がある。軽量化の目的は会話を潰すことではなく、会話品質を保ったまま不要な Codex 起動を避けることである。

## VTDD 全体で進める部分

Issue #455 のうち、今回の slice は Dashboard の通常 chat entrypoint での usage-aware routing に限定する。PR #750 で入った reviewer fallback 重複抑止は前提として扱い、同じ PR head の fallback retry 抑止は再実装しない。Cloudflare rowsWritten の presence/persistence 修正や bridge lifecycle guard も今回は触らない。

## 設計

DashboardChatRoom の `owner_message` 処理で、owner message を durable thread に保存し ack した後、app-server bridge dispatch 前に軽量 intent 分類を挟む。分類が read/status/cost explanation の範囲に収まる場合は Butler message を同じ thread に保存して broadcast し、`dispatchOwnerMessageToAppServerBridge()` を呼ばない。返答には `cost_boundary: lightweight_worker_reply / codexWillStart=false` を明記する。

ただし返答本文は status packet ではなく、owner の発言に対する自然な回答を先に出す。`cost_boundary` は「補足」へ下げ、対象 repo / Issue などの internal context も必要最小限にする。

分類が実装、調査、ファイル編集、PR 作成、merge、deploy、reviewer、画像解析、repo truth 深掘りなどを含む場合は fast path にせず、既存 app-server bridge 経路へ渡す。その場合は transient status に「Codex app-server を使うため usage を消費し得る」ことを短く出す。これは処理を止める承認 gate ではなく、owner-facing cost visibility である。

## 仮説

現在の `DashboardChatRoom` は VPS maintenance intent 以外の owner turn を、bridge 接続時に即 `app_server_turn_requested` として送る。そのため「今の状況は？」「クレジット消費が多い？」のような軽い相談でも app-server Codex thread が動き、Mac から離れたことで通常会話の Codex usage が増えた体感につながっている。Worker 側で lightweight reply を返せば、実行機能を落とさずに、少なくとも明白な read/status/cost guard 依頼の Codex 起動を抑えられる。

## 検証計画

- Unit: DashboardChatRoom が cost/status 系の軽い owner turn を保存し、Butler の軽量応答を保存して、connected app-server bridge へ送らない。
- Unit: 実装修正系の owner turn は fast path されず、既存通り app-server bridge へ送られる。
- Unit: fast path 応答は owner の質問への回答を先頭に置き、`cost_boundary` と `codexWillStart=false` は補足として含める。
- Local: `npm run build:worker`、`node --test test/worker.test.js`、`npm run check:generated-worker`、`git diff --check` を実行する。

## 改修見積もり

- `src/worker/runtime.js`: DashboardChatRoom の owner message dispatch 前に `buildDashboardCostAwareFastPathReply()` を呼ぶ。軽量判定 helper と日本語応答 builder を追加する。risk は通常会話を誤って短絡し、owner が期待する Codex 会話を止めること。
- `test/worker.test.js`: bridge 接続時の fast path と heavy path の分岐を追加する。risk は既存の ordinary owner turn test と期待が衝突すること。
- `worker.js`: generated worker 更新。risk は source と generated の不一致。

## 既に通っている経路

PR #750 は reviewer fallback の same-head 重複起動を抑止している。`docs/butler/intent-mode-contract.md` は Read mode が heavy tool を起動しないこと、Status Packet に `cost_boundary` を含めることを定義している。Dashboard app-server live path は ordinary conversation を app-server に渡せるが、軽量 read/status を Worker で返す fast path はまだ弱い。

## 未確認の境界

実際の Codex Analytics 使用量 API は読まない。今回の PR だけでは、全ての status/read を GitHub App-backed runtime truth で完全回答するところまでは行かない。軽量応答は「Codex を起動しないための入口整理」であり、PR 詳細や CI 詳細の深い読みに必要な tooling は次 slice で分ける。

## 穴が出そうな箇所

「状況を調べて」は軽く見えるが、repo/PR/CI の deep read を要求する場合がある。今回の fast path は owner に次の安全な進め方を返すだけで、実際の repo truth 深掘りは app-server または将来の GitHub App read route に委ねる。メディア添付がある場合は画像解析期待があるため fast path しない。

## PR 前に確認すること

branch が latest `origin/main` から切られていること、PR #755 の worker changes が取り込まれていること、未追跡 `.tmp/` と `test-results/` を混ぜないこと、PR body が日本語-first で #455 criteria と incomplete boundary を明示すること。

## 実装候補と捨てた案

採用: Worker 側で明白な cost/status/read 依頼だけを軽量応答し、重い操作は既存 app-server 経路へ渡す。

捨てた案: app-server bridge の system prompt だけで節約する。app-server を起動した時点で Codex usage を消費し得るため、Issue #455 の fast path にはならない。捨てた案: reviewer や E2E を止める。VTDD の品質 gate を落とすため Non-goal。

## merge 後に通す E2E

Dashboard から「Codex クレジット消費を削れる？」のような軽量相談を送り、bridge 側に `app_server_turn_requested` が出ないこと、チャットには cost boundary が表示されることを確認する。別途、実装依頼では app-server turn が動くことを確認する。

## 次の PR を増やさない理由

この PR は Worker entrypoint の最小 routing に限定する。GitHub App read route で PR/Issue/Actions を完全に軽量回答する slice は別 PR の方が安全で、今回混ぜると runtime truth 読みと UI/UX と cost guard が膨らむ。

## 停止条件

軽量 fast path が実装修正や high-risk action を誤って飲み込む、repo truth を読んだふりになる、reviewer/CI/E2E gate を削る必要が出る、または deploy/credential/permission mutation が必要になる場合は停止する。
