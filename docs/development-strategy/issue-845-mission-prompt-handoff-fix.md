# Issue #845 開発前作戦図 — Mission prompt handoff fix

## 完了体験

Owner が Dashboard Butler に「TOMIO を売れる状態まで持っていって」と伝えると、DashboardChatRoom が作った Business Mission が `app_server_turn_requested` に入り、その同じ Mission truth が `handleDashboardTurnRequest()` を通って実際の Codex app-server `turn/start` input に入る。

PR #847 は DashboardChatRoom request と `buildDashboardTurnInputText()` 単体を実装したが、runtime の中継点 `handleDashboardTurnRequest()` が `businessMission` / `businessMissionSummary` を prompt builder に渡していない。見かけ上 request に Mission が存在しても、実際の VPS Codex prompt では失われる。ここを最小修正し、直接 integration test で証明する。

## VTDD 全体で進める部分

- PR #847 の Mission runtime path を実際の Codex app-server turn input まで接続する。
- DashboardChatRoom / Mission durable state / unrelated-turn isolation / supersede は変更しない。
- authority boundary、GO/passkey、app-server approval behavior は変更しない。
- Issue #845 の次段階である structured reconciliation / standing Mission authority へ進む前に、現在の backbone の欠落を塞ぐ。

## 設計

`scripts/run-dashboard-app-server-bridge.mjs` の `handleDashboardTurnRequest()` 内で `buildDashboardTurnInputText()` を呼ぶ際、request の `businessMission` と `businessMissionSummary` をそのまま渡す。

新しい transport や parser は追加しない。`DashboardChatRoom -> app_server_turn_requested -> handleDashboardTurnRequest -> buildDashboardTurnInputText -> buildAppServerTurnStartRequest` の既存経路だけを修正する。

test は `handleDashboardTurnRequest()` を fake appServer で直接実行し、最終的に appServer の `turn/start` request 内 text に Mission ID / ownerGoal / workstream / authority rule が含まれることを確認する。単に `buildDashboardTurnInputText()` を直接呼ぶ test だけでは completion evidence としない。

## 仮説

root cause は `handleDashboardTurnRequest()` の prompt builder call が `businessMission` / `businessMissionSummary` を引数に含めていないこと。PR #847 の mapped test は `buildDashboardTurnInputText(missionTurn)` を直接呼んでいたため、この中継欠落を通過せず見逃した。

予測: 2フィールドを runtime call に追加し、handleDashboardTurnRequest integration test を追加すれば、generated worker 以外の既存 Dashboard continuity / app-server tests を壊さず Mission prompt handoff が通る。

## 検証計画

### Unit / Integration

- `handleDashboardTurnRequest()` に Business Mission request を渡す。
- fake appServer が受け取る `turn/start` input text に以下が含まれること:
  - Mission ID
  - TOMIO ownerGoal
  - `research` ready workstream
  - businessMission coordination rule
  - high-risk authority boundary
- Mission 無し request では既存 prompt shape を維持する。
- `node --test test/dashboard-app-server-bridge.test.js`
- `npm test`
- `npm run check:self-parity`
- `npm run check:generated-worker`

### E2E

- existing `test/issue845-dashboard-mission-runtime-e2e.test.js` を再実行する。
- 今回は additionally `handleDashboardTurnRequest()` を経由する bridge integration test を evidence とし、Dashboard request と prompt builder の間を飛ばさない。

## 改修見積もり

| Path | Boundary | Expected change | Risk |
| --- | --- | --- | --- |
| `scripts/run-dashboard-app-server-bridge.mjs` | `handleDashboardTurnRequest()` prompt handoff | Mission 2 fields を builder に渡す | low |
| `test/dashboard-app-server-bridge.test.js` | bridge integration | actual turn/start input assertion | low |
| `docs/development-strategy/issue-845-mission-prompt-handoff-fix.md` | strategy | root cause / proof | low |
| `docs/mvp/e2e/issue-845-dashboard-mission-runtime-local-e2e.md` | evidence note | runtime handoff correctionを追記 | low |
| `worker.js` | generated artifact | source rebuild | generated parity only |

## 既に通っている経路

- DashboardChatRoom strong goal detection / Mission durable state。
- `app_server_turn_requested.businessMission` / summary。
- `buildDashboardTurnInputText()` の Mission formatting。
- unrelated turn isolation / follow-up reuse / supersede。
- PR #847 local mapped E2E。

## 未確認の境界

- structured workstream result reconciliation は未接続。
- Mission-scoped standing execution authority は未接続。
- production deploy / iPhone live E2E は未実施。

## 穴が出そうな箇所

- builder unit testだけでは runtime handoff漏れを再び見逃す。
- generated worker が source とずれる。
- prompt metadataを usageProfile のように「判断材料にしない」扱いへ誤って落とす可能性。

## PR 前に確認すること

- current main が PR #847 merge SHA を含むこと。
- `handleDashboardTurnRequest()` の `buildDashboardTurnInputText()` call を再読する。
- existing bridge test fixture で `turn/start` input を検査できること。
- CI / generated worker parity を確認する。

## 実装候補と捨てた案

採用:
- 既存 request fields を prompt builder へ明示的に渡す。
- actual handleDashboardTurnRequest integration test。

捨てた案:
- DashboardChatRoom で prompt text を事前生成する。
- Mission JSON を `text` 本文へ直接埋め込む。
- bridge 側が durable state を再取得する。
- このfixと同時に reconciliation / standing authority を実装する。

## merge 後に通す E2E

- `test/issue845-dashboard-mission-runtime-e2e.test.js`
- `test/dashboard-app-server-bridge.test.js` の `handleDashboardTurnRequest` Mission prompt integration case
- full `npm test` + generated worker parity

## 次の PR を増やさない理由

この PR は PR #847 の runtime handoff欠落だけを閉じる修正であり、この欠落を残したまま次の reconciliation / authority PR を積むと誤った backbone 上に機能を増やすことになる。ここで入口→実 app-server prompt を閉じ、次の bounded slice へ進める。

## 停止条件

- Mission fieldsを渡すために authority / approval semantics を変える必要が出た場合。
- existing non-Mission turn prompt behavior が変わる場合。
- full tests / generated worker parity が通らない場合。

## Execution Queue Delta

- Queue position before: Issue #845 は `Now`。PR #847 runtime slice は merge 済み。Issue #741 は active `Next`。
- Preemption decision: `ROOT`
- Queue delta: Issue #845 は `Now` のまま、PR #847 で発見した Mission prompt handoff gap を最優先で修正する。
- Why this PR is next: Mission が app-server request には存在するのに actual Codex prompt へ届かないため、このままでは owner goal orchestration が実働しない。
- Active Issues not downscoped: Issue #741 を含む existing active Issues are not downscoped。Issue #845 の backbone gap 修正のみ。
