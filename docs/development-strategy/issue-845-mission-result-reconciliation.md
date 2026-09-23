# Issue #845 開発前作戦図 — Business Mission result reconciliation

## 完了体験

Owner が Dashboard Butler に上位目的を渡した後、VPS Codex app-server が現在の Mission workstream を実行し、その turn の結果を機械可読な result contract として返す。bridge は result を owner-visible本文から分離して DashboardChatRoom へ送り、DashboardChatRoom は active Mission の該当 workstream だけを更新する。

結果が `completed` なら依存する次 workstream が `ready` になる。`blocked` なら blocker / required owner action を Mission state に残す。`in_progress` なら同じ workstream を継続対象として保持する。Mission ID / workstream ID が一致しない result や result marker 欠落では、完了扱いにしない。

この slice では next workstream の自動再dispatchまでは行わない。まず「VPSで何をやったかが Mission durable state に戻る」往復を閉じる。

## VTDD 全体で進める部分

- Business Mission prompt に current workstream と result contract を追加する。
- app-server final reply から machine result marker を parse / strip する。
- bridge の final `app_server_reply` に `businessMissionResult` metadata を付ける。
- DashboardChatRoom が final reply を通常保存する前に `businessMissionResult` と active Mission scope を照合し、`applyBusinessWorkstreamResult()` で durable state を更新する。
- owner-visible final reply には machine marker を出さない。
- malformed / wrong-scope / missing result では Mission を勝手に進めない。

## 設計

### 1. Current workstream contract

`buildDashboardTurnInputText()` は `businessMissionSummary.nextAutomaticWork[0]` を current workstream として prompt に載せる。

Mission が存在し current workstream がある時だけ、final answer の末尾へ1行の result markerを返すよう app-serverに指示する。

形式:

`VTDD_BUSINESS_MISSION_RESULT: {"missionId":"...","workstreamId":"...","status":"completed|blocked|in_progress","summary":"...","evidence":["..."],"requiredAction":"..."}`

`completed` は current workstream の purpose を実際に満たし evidence がある時だけ。`blocked` は owner action / external authority / missing capability 等で停止する時。`in_progress` は autonomous work をまだ続けられるが、その turn では完了していない時。

### 2. Bridge parser

`scripts/run-dashboard-app-server-bridge.mjs` に result parser / visible text stripper を追加する。

turn completion 時:
- result marker が validなら final `app_server_reply.businessMissionResult` に normalized result を付ける。
- owner-visible `app_server_reply.text` から marker は削除する。
- marker が missing / malformed / scope mismatchなら `businessMissionResult.status=unverified` を付け、Mission mutation を禁止する。
- Mission context無しturnでは従来通り metadata を付けない。

### 3. Dashboard reconciliation

`DashboardChatRoom.acceptAppServerBridgeMessage()` は generic app-server reply normalization より前に raw `app_server_reply.businessMissionResult` を処理する。

- active Mission read
- `missionId` exact match
- `workstreamId` が active Mission workstreams に存在
- status whitelist
- completed / blocked / in_progress を core workstream statusへ mapping
- `applyBusinessWorkstreamResult()`
- updated Mission を `writeBusinessMission()` で durable 保存
- wrong-scope / unverified は state mutation しない

`in_progress` は `running` にするが、次回 Mission summary で同 workstream が continuation candidate になるよう core ready selection も確認する。必要なら `getReadyBusinessWorkstreams()` を running continuation対応に調整する。ただし自動dispatchはこの slice外。

## 仮説

Issue #845 の current root gap は一方向の Mission contextしかなく、実行結果が Mission durable stateへ戻らないこと。これでは workstream 1 が終わっても workstream 2 が ready にならず、Butlerが継続判断できない。

result markerを final reply末尾の machine contractに限定し、bridgeでstripして別event化すれば、UI本文を汚さず app-serverの自由文回答と deterministic Mission state reconciliationを両立できる。

## 検証計画

### Unit

- result marker parser:
  - valid completed / blocked / in_progress
  - malformed JSON
  - marker無し
  - owner-visible text strip
  - mission/workstream scope fields preserve
- prompt builder:
  - current workstream / result contractを含む
  - Mission無しなら contractを含めない

### Integration

- `handleDashboardTurnRequest()` fake app-server:
  - visible reply + result marker delta
  - completion時に machine result event + marker除去済み app_server_reply
- `DashboardChatRoom`:
  - valid completed resultで workstream completed + next ready
  - blocked resultで Mission blocked + requiredAction保持
  - wrong mission/workstream / unverifiedで state不変

### E2E

- `test/issue845-dashboard-mission-reconciliation-e2e.test.js`:
  Dashboard owner goal -> Mission create -> bridge turn prompt -> result marker -> Dashboard reconcile -> next workstream ready を1本で通す。
- full `npm test`
- self-parity / generated-worker parity

## 改修見積もり

| Path | Boundary | Expected change | Risk |
| --- | --- | --- | --- |
| `src/core/business-mission-orchestrator.js` | running continuation / result validation helper if needed | Mission state transition補強 | medium |
| `src/worker/runtime.js` | DashboardChatRoom result event handling | durable Mission reconciliation | medium |
| `scripts/run-dashboard-app-server-bridge.mjs` | prompt/result protocol | marker contract / parser / event emission / strip | medium |
| `test/business-mission-orchestrator.test.js` | core result state | completed/blocked/in_progress | low |
| `test/dashboard-app-server-bridge.test.js` | bridge result protocol | parse/strip/event | low |
| `test/worker.test.js` | DO reconciliation | scope / durable state | low |
| `test/issue845-dashboard-mission-reconciliation-e2e.test.js` | mapped E2E | full round trip | medium |
| `docs/mvp/e2e/issue-845-dashboard-mission-reconciliation-local-e2e.md` | evidence | result round-trip contract | low |
| `worker.js` | generated artifact | source build result | generated parity |

## 既に通っている経路

- strong goal -> durable Mission
- Mission attach / unrelated isolation / supersede
- Mission -> `app_server_turn_requested`
- Mission -> actual Codex `turn/start` prompt
- existing Mission workstream dependency plan / `applyBusinessWorkstreamResult()`

## 未確認の境界

- app-server modelが result marker contractを productionで常に守る保証はないため、missing/malformedを fail-closedで扱う。
- next workstream auto-dispatchは未接続。
- standing Mission execution authorityは未接続。
- production iPhone/PWA live E2Eは未実施。

## 穴が出そうな箇所

- markerが owner本文に漏れる。
- malformed markerを completedとして扱う。
- stale turnの resultで新Missionを更新する。
- wrong workstream resultで dependency chainを飛ばす。
- blocked resultが next workstreamをreadyにしてしまう。
- in_progressが ready listから消え、Missionが止まる。
- result metadata と final reply が同一 envelope なので reconciliation が owner-visible reply 保存より先に走ること。

## PR 前に確認すること

- current mainが PR #848 merge SHAを含む。
- `applyBusinessWorkstreamResult()` semanticsを再読する。
- bridge turn completion / accumulatedText / event normalizationを再読する。
- DashboardChatRoom generic event handlerより前に専用 result eventを処理できることを確認する。
- generated worker parityを必ず通す。

## 実装候補と捨てた案

採用:
- explicit final marker + bridge parse/strip + final reply structured metadata。
- scope mismatchは fail-closed。
- core state transitionを再利用。

捨てた案:
- app-server progress stageだけから workstream completionを推測する。
- final reply自然文をLLMで再評価して completion判定する。
- completedを turn completionだけで自動推定する。
- result eventと同時に次 workstreamを無条件auto-dispatchする。

## merge 後に通す E2E

- `test/issue845-dashboard-mission-reconciliation-e2e.test.js`
- existing Issue #845 Mission runtime E2E
- bridge integration
- full test / parity

## 次の PR を増やさない理由

この PR は result round-trip と durable state reconciliationを一つの契約として閉じる。next automatic dispatch / standing authorityは result stateが信頼できることを前提とする別 risk classなので、このPRに混ぜない。

## 停止条件

- machine resultを owner-visible textから安全に分離できない場合。
- stale/wrong-scope resultを確実に拒否できない場合。
- authority semantics変更が必要になった場合。
- full tests / generated worker parityが通らない場合。

## Execution Queue Delta

- Queue position before: Issue #845 は `Now`。PR #848 prompt handoff fix は merge済み。Issue #741 は active `Next`。
- Preemption decision: `ROOT`
- Queue delta: Issue #845 remains `Now`; Mission result reconciliation を次の bounded slice とする。
- Why this PR is next: owner goalが実行者へ届く一方向経路は閉じたが、workstream結果がMission stateへ戻らないため自律継続判断ができない。
- Active Issues not downscoped: Issue #741を含む existing active Issues remain active and are not downscoped。
