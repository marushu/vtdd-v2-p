# Issue #845 開発前作戦図 — Mission Workstream Reconciliation

## 完了体験

Owner が Dashboard Butler に目的を渡して Mission が始まった後、Codex app-server が current ready workstream の実作業を終えるか blocker に到達した時、結果が machine-readable に DashboardChatRoom へ戻り、durable Mission state が更新される。completed なら次の workstream が ready になり、blocked なら owner-facing summary に blocker / required action が出る。単なる会話 reply や status question では Mission state を勝手に進めない。

## VTDD 全体で進める部分

- Business Mission prompt に bounded reconciliation contract を追加する。
- Codex final text から machine-readable workstream result marker を bridge で抽出する。
- marker を owner-facing text / progress から除去する。
- bridge が validated result を `business_mission_workstream_result` event として DashboardChatRoom へ返す。
- DashboardChatRoom が current durable Mission と照合し、`applyBusinessWorkstreamResult()` で state を更新・保存する。
- updated Mission / summary を thread payload / transient status に返す。

## 設計

marker format:

`<!-- VTDD_BUSINESS_WORKSTREAM_RESULT {"missionId":"...","workstreamId":"...","status":"completed","outcome":"...","evidence":["..."]} -->`

または blocked:

`<!-- VTDD_BUSINESS_WORKSTREAM_RESULT {"missionId":"...","workstreamId":"...","status":"blocked","blocker":"...","requiredAction":"..."} -->`

bridge parser は以下を満たす場合だけ受理する。

- request に active Business Mission がある。
- marker missionId が request Mission と一致する。
- workstreamId が `businessMissionSummary.nextAutomaticWork[0]` と一致する。
- status は `completed` または `blocked` のみ。
- completed は non-empty evidence を1件以上持つ。
- blocked は blocker を持つ。
- JSON parse error / duplicate marker / mismatch は state change を起こさない。

marker は owner-facing final text と streaming/progress narration から除去する。

DashboardChatRoom は event の threadId / missionId / workstreamId を current durable Mission と照合し、stale/superseded Mission の result を拒否する。valid result のみ `applyBusinessWorkstreamResult()` を適用して active pointer と mission record を更新する。

この slice は standing Mission authority を追加しない。reconciliation は内部状態更新のみで、merge/deploy/spend/external publish 等の authority を変えない。

## 仮説

現在の Mission は Dashboard -> app-server prompt まで届くが、Codex の仕事結果が durable Mission に戻らないため `research ready` のまま止まり、Butler が次 workstream を自動判断できない。final reply に bounded structured result を付け、既存 bridge/DO path で reconciliation すれば、新 transport を増やさず Mission state machine を閉じられる。

## 検証計画

- Unit: marker parser の valid completed / valid blocked / invalid JSON / wrong mission / wrong workstream / missing evidence / duplicate marker。
- Unit: marker strip が owner-facing text から machine payload を消す。
- Worker: valid result event で Mission research completed -> product ready。
- Worker: stale missionId / unknown workstreamId は state を変更しない。
- Integration: fake app-server final response marker -> bridge result event -> DashboardChatRoom -> durable Mission update。
- Regression: marker無し final response は Mission unchanged。
- Full: scoped tests green 後に full npm test once / generated worker parity / CI once。

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`: marker contract / parser / strip / final-result event emission。risk: reply text regression。
- `src/worker/runtime.js`: result event validation / durable reconciliation。risk: stale Mission overwrite。
- `src/core/business-mission-orchestrator.js`: evidence preservation or result validation helper if needed。risk: Mission schema drift。
- `test/dashboard-app-server-bridge.test.js`: parser / actual turn path。
- `test/worker.test.js`: DO reconciliation。
- `test/issue845-dashboard-mission-runtime-e2e.test.js`: mapped Mission progression。
- generated `worker.js`: source build output only if Worker/core changes require it。

## 既に通っている経路

- owner goal -> durable Mission。
- Mission -> `app_server_turn_requested`。
- Mission -> actual Codex turn/start prompt。
- `applyBusinessWorkstreamResult()` core state transition。
- DashboardChatRoom DO Mission storage / thread payload。
- app-server bridge -> DashboardChatRoom event channel。

## 未確認の境界

- Codex が marker を毎回正しく生成する production reliability は live E2E で後確認が必要。
- standing Mission authority / remote runner auto-dispatch はこの slice の後。
- blocked result の owner approval 後 resume protocol は standing authority/reconciliation continuation slice で扱う。

## 穴が出そうな箇所

- marker が streaming delta に見える。
- user prompt 内 marker を誤parseする。
- old/superseded Mission result が current Mission を上書きする。
- current ready workstream 以外を completed にする。
- completed evidence なしで次 workstream をunlockする。
- marker parse失敗を reply failure と誤認する。

## PR 前に確認すること

- Issue #845 current SC / Non-goal。
- current main の Mission core / DashboardChatRoom / app-server bridge path。
- current ready workstream summary shape。
- existing final reply/progress tests。
- generated worker ordering。

## 実装候補と捨てた案

採用:
- final assistant text の hidden bounded marker + bridge validation。
- current ready workstream 1件だけ reconcile。
- stale Mission guard。

捨てた案:
- turn completionだけで自動completed。
- arbitrary JSONをそのままDOへ保存。
- standing authority と同時実装。
- external connector resultまで同時接続。
- Worker内に別LLM classifierを追加。

## merge 後に通す E2E

1. product Missionを作る。
2. research workstream付き app-server turnを開始。
3. final reply に valid completed marker。
4. bridgeが owner textからmarkerをstrip。
5. result eventがDashboardChatRoomへ届く。
6. durable Mission の research=completed / product=ready。
7. thread-state summary の progress=1/9 / nextAutomaticWork=product。
8. wrong mission/workstream markerではstate unchanged。

## 次の PR を増やさない理由

reconciliation の機械経路だけをこのPRで閉じる。standing authority / auto-dispatch はこの durable result truth が成立してから載せる方が安全で、同時実装すると「何が終わったか分からないのに自走する」状態になるため意図的に分離する。

## 停止条件

- Mission result を internal state update 以上の authority grant に使う必要が出た場合。
- markerを安全に current Mission/current workstreamへbindできない場合。
- existing owner-facing reply pathを壊さないと実装できない場合。
- stale/superseded Mission resultをrejectできない場合。

## Execution Queue Delta

- Queue position before: Issue #849 governance slice merged。Issue #845 resumes as product ROOT.
- Preemption decision: ROOT
- Queue delta: Issue #845 moves back to `Now` for Mission workstream reconciliation. Issue #741 remains active Next.
- Why this PR is next: standing autonomy before result reconciliation would let work advance without durable completion truth.
- Active Issues not downscoped: existing active Issues remain active/incomplete; this slice only advances Issue #845.
