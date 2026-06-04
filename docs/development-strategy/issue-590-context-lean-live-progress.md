# Issue #590: context lean live progress

## 完了体験

Dashboard Butler で短い会話を送った時、VPS Codex CLI / codex app-server には owner の短い入力だけが届く。`usageProfile`、`costBoundary`、未解決 repository preflight、一般 authority rule は prompt 本文に混ざらない。

開発や調査など repo / Issue / ops 文脈が必要な時だけ、必要最小限の Dashboard context を付ける。作業中の live progress は owner が待ちを理解するために画面上へ流れるが、完了後は最終回答側の要約に任せ、通常 chat message の永続 `progressSummary` として残さない。

## VTDD 全体で進める部分

Issue #590 の owner-facing observability を、context window exceeded とコスト/性能劣化を増やさない形へ戻す。Issue #455 の「Butler は app-server bridge へ届ける」は維持するが、Worker が毎 turn に重い制御文を prompt 化する状態は止める。

## 設計

- `usageProfile` / `costBoundary` は routing / runtime metadata として保持し、`buildDashboardTurnInputText()` の prompt 本文には入れない。
- 普通の会話では `Dashboard Butler turn context:` を付けず、owner text だけを送る。
- repository / relatedIssue / real trafficControl / vpsMaintenancePassThrough / media の時だけ context wrapper を付ける。
- `authority` は context wrapper が必要な時だけ補助情報として入れる。authority だけで wrapper を発生させない。
- `app_server_reply_delta` / `long_turn_checkpoint` は transient snapshot と chat-visible live UI の材料に留め、final durable Butler message に `progressSummary` を添付しない。

## 仮説

最近の failure は live progress 表示そのものではなく、同時期に入った usage/cost routing と VPS maintenance pass-through により、短い turn でも巨大な `Dashboard Butler turn context` が毎回 app-server thread に積まれることが主因。

`もしもし` 相当の短文に約 1.8KB の制御文が付くと、同じ `codexThreadId` を resume し続ける仕様と組み合わさり、5時間枠、応答速度、context window に悪影響が出る。

## 検証計画

- `buildDashboardTurnInputText()` が ordinary conversation では入力本文だけを返す unit test。
- usage/cost metadata だけでは prompt context が発生しない unit test。
- repository / trafficControl / VPS maintenance / media の wrapper は維持される unit test。
- `app_server_reply_delta` は durable chat message にならず、final reply に `progressSummary` を残さない Worker test。
- `npm run build:worker`、`npm run check:generated-worker`、`npm run verify:worker`。

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`: `buildDashboardTurnInputText()` の context 発生条件と prompt lines を整理する。risk: repo/ops turn で必要な guardrail が抜ける。
- `src/worker/runtime.js`: ordinary conversation では unresolved trafficControl を作らず、app-server turn request payload から不要な heavy context を除く。final reply への progress summary 添付を止める。risk: progress summary replacement evidence が変わる。
- `test/dashboard-app-server-bridge.test.js`: ordinary/cost/profile context size regression を追加する。
- `test/worker.test.js`: final durable message に progressSummary が残らないこと、ordinary request payload が lean であることを追加する。
- `worker.js`: generated bundle update。

## 既に通っている経路

- Dashboard owner message -> `app_server_turn_requested` -> bridge `turn/start` は動いている。
- `usageProfile` / `costBoundary` classifier と app-server command args は存在する。
- `app_server_reply_delta` は durable chat message にはしない test がある。
- transient progress snapshot は WebSocket reconnect で読める。

## 未確認の境界

production `codex app-server` の context window exceeded が、既存 backend thread の蓄積だけで再現するか、今回の prompt 肥大化がどの程度寄与したかは production runtime でまだ未確認。

## 穴が出そうな箇所

- authority rule を prompt から外しすぎると、repo/ops turn の安全境界が弱くなる。
- live progress を final `progressSummary` へ残さないことで、完了後の進行ログ evidence は薄くなる。ただし owner 方針では完了後に残さなくてよい。
- backend thread 自体がすでに詰まっている場合、今回の修正だけでは既存 thread の context exceeded が即時には消えない。

## PR 前に確認すること

- open PR 0。
- branch は latest `origin/main` から作成。
- unrelated untracked E2E assets を stage しない。
- generated `worker.js` を source と同じ commit に含める。

## 実装候補と捨てた案

採用: ordinary conversation の prompt を lean にし、usage/cost は metadata に留める。live progress の final durable attachment を止める。

捨てた案: context window exceeded 時に即 backend thread を無限生成する案。原因の prompt 肥大化を隠し、thread 増殖リスクがあるため今回の主対応にしない。

## merge 後に通す E2E

production Dashboard Butler で `もしもし` のような短文が app-server から返ること、context window exceeded が再発しないこと、通常会話で巨大制御文が visible response に混ざらないことを確認する。長時間開発 live progress は別途 #590 の次 slice で確認する。

## 次の PR を増やさない理由

prompt 肥大化と live progress durable attachment は同じ owner observed regression の原因候補であり、片方だけ直すと context window exceeded / 最終ログ混入が残る。

## 停止条件

repo / Issue / VPS maintenance の authority boundary を保てないことが判明した場合、実装を止めて scope を再確認する。deploy、credential、permission、root helper mutation が必要になった場合はこの PR では扱わない。
