# Issue #845 開発前作戦図 — Dashboard Mission Runtime

## 完了体験

Owner は Dashboard Butler の通常チャットで「TOMIO を売れる状態まで持っていって」「hibou の問い合わせを全部処理して」のように目的だけを伝える。DashboardChatRoom は強い mission intent を検出した場合、その owner goal を thread-scoped durable Mission として保存する。以後は Mission 関連の follow-up にだけ同じ Mission truth を添付し、無関係な通常会話には standing Mission を混ぜない。別種の strong business goal は新しい Mission として切り替えられる。VPS Codex / codex app-server は Mission の ready workstream と authority boundary を受け取り、owner に内部 Agent 管理をさせず、reversible work を前へ進める。

この slice では Mission の runtime 入口 / durable state / bridge handoff までを接続する。外部サービスへの実支出・公開・deploy・credential mutation は実行しない。

## VTDD 全体で進める部分

- Issue #845 core の Mission / role / authority contract を Worker runtime から利用可能にする。
- Dashboard Butler owner message から強い mission intent を判定する。
- Mission を DashboardChatRoom Durable Object storage に保存し、thread の active Mission として再利用する。
- bridge 未接続時でも owner message と Mission を保存し、再接続後の pending replay に Mission context を付与する。
- `app_server_turn_requested` に Business Mission truth と owner-facing summary を添付する。
- VPS bridge の `buildDashboardTurnInputText()` が Mission / ready workstream / authority rule を Codex app-server prompt context に含める。
- Dashboard thread-state / WebSocket thread payload に current Business Mission truth を含め、owner / runtime が現在地を読めるようにする。

## 設計

`src/core/business-mission-orchestrator.js` に、通常会話を誤って Mission 化しないための strong-intent classifier を追加する。

`DashboardChatRoom` には以下を追加する。

- `businessMissionStateKey(threadId)`
- `readBusinessMission(threadId)`
- `writeBusinessMission(threadId, mission)`
- `resolveBusinessMissionForOwnerMessage({ threadId, ownerMessage })`

Mission ID は owner message ID と thread ID から決定的に作る。既存 active / blocked Mission がある場合でも、すべての turn に自動付与しない。core classifier で `attach / supersede / unrelated` を分ける。

- 同じ Mission の follow-up / progress / continuation は既存 Mission を再利用する。
- 無関係な通常会話は active Mission を durable state に残したまま、その turn の app-server request には Mission を付けない。
- `別件` / `新しいミッション` 等の明示切替、Mission kind の変化、TOMIO→hibou のような business anchor の明確な変化を伴う strong goal は、新しい Mission を作って active pointer を切り替える。

`dispatchOwnerMessageToAppServerBridge()` は caller が Mission context を明示した場合はその値を尊重し、pending replay / context reset retry のような caller 未指定時だけ owner message から Mission context を再解決する。これにより「null=この turn は Mission 非関連」を active Mission で勝手に上書きしない。

`scripts/run-dashboard-app-server-bridge.mjs` の `buildDashboardTurnInputText()` は Mission context を prompt に追加し、以下を明示する。

- Mission は owner が与えた上位目的である。
- ready workstream から次の reversible work を自律的に進める。
- 必要なら subagent / skill / repo-backed tool を使う。
- owner に Agent の内部交通整理をさせない。
- Issue / strategy / tests / PR evidence など既存 repository guardrail は維持する。
- merge / deploy / spend / external publish / contract / credential / permission / destructive は既存 owner boundary を越えない。
- blocker または owner action が必要になるまで、確認のための確認を増やさない。

## 仮説

現在の Dashboard Butler -> app-server bridge は owner turn を Codex に届けること自体はできているが、各 turn は独立した「会話依頼」として扱われ、business-level goal / workstream / standing authority scope が durable runtime truth になっていない。この欠落が、Owner が毎回「次はこれ」「次はあれ」と交通整理する root cause の一つである。

Mission を DashboardChatRoom に durable 化し、app-server request / prompt に毎回付ければ、まず owner goal を thread を跨ぐ実行文脈に昇格できる。これは full multi-agent scheduler ではないが、次の dispatch/reconciliation loop の必要な runtime backbone になる。

## 検証計画

### Unit

- ordinary question 「今日は何月何日？」は Mission を開始しない。
- 「TOMIO を売れる状態まで持っていって」は Mission を開始する。
- 「hibou の問い合わせを全部処理して」は customer_inquiry Mission を開始する。
- active Mission がある状態の mission follow-up は同じ Mission を保持する。
- active Mission があっても「今日は何月何日？」のような無関係 turn は `businessMission=null` で app-server に届く。
- active TOMIO Mission 中に「hibou の問い合わせを全部処理して」のような別種 strong goal を投げると、新しい Mission ID に切り替わる。
- 同じ target/kind の strong follow-up は不要に Mission を分裂させない。
- Mission が completed/cancelled の後の新規 strong intent は新しい Mission を開始できる。
- Worker の `app_server_turn_requested` に Mission / summary が入る。
- bridge 未接続で pending replay した後も Mission context が入る。
- `thread-state` / `thread` payload に Mission truth が入る。
- bridge prompt に Mission goal / ready workstream / authority rule が入る。

### Integration

- `npm run build:worker`
- `node --test test/business-mission-orchestrator.test.js test/worker.test.js test/dashboard-app-server-bridge.test.js`
- `npm run check:self-parity`
- `npm run check:generated-worker`

### E2E

Mapped local E2E: Dashboard Butler WebSocket から strong Mission owner turn を送り、owner message ack → durable Mission → `app_server_turn_requested.businessMission` → bridge `buildDashboardTurnInputText` まで同じ Mission ID / goal / workstream が保持されることを検証する。

## 改修見積もり

| Path | Boundary | Expected change | Risk |
| --- | --- | --- | --- |
| `src/core/business-mission-orchestrator.js` | mission intent classifier | strong owner goal 判定 helper | 誤検出で普通の会話が Mission 化される |
| `src/core/index.js` | core export | Mission API export | generated worker bundle 差分 |
| `src/worker/runtime.js` | DashboardChatRoom / app-server turn | Mission durable store / thread payload / bridge request | chat continuity / DO write regression |
| `scripts/run-dashboard-app-server-bridge.mjs` | prompt context | Mission / workstream / authority instructions | prompt肥大 /通常会話汚染 |
| `test/business-mission-orchestrator.test.js` | core unit | strong-intent cases | classifier false positive/negative |
| `test/worker.test.js` | Worker / DO integration | Mission persistence / turn request / pending replay | existing WebSocket ordering assumptions |
| `test/dashboard-app-server-bridge.test.js` | bridge unit | Mission prompt context | existing prompt exact-match regression |
| `worker.js` | generated artifact | build result | direct edit禁止 |

## 既に通っている経路

- Dashboard owner message -> DashboardChatRoom -> `app_server_turn_requested`。
- bridge reconnect pending replay。
- codex thread mapping / resume。
- trafficControl / authority / usageProfile / costBoundary の prompt context。
- Dashboard thread-state / WebSocket thread broadcast。
- Issue #845 Business Mission core。

## 未確認の境界

- Mission workstream の完了結果を app-server から structured event として Worker に戻す reconciliation protocol は次段階。
- Mission の cross-thread / cross-device global index は Memory Core / D1 との接続が必要。
- target product repository が repo-less owner turn から一意に解決できない場合は app-server / alias resolution に委ねる。
- App Store / Ads / Gmail / WordPress の connector write capability はこの slice では未接続。

## 穴が出そうな箇所

- 「〜したい」だけの雑談を strong mission と誤検出すると勝手に Mission が増える。
- active Mission を無関係 turn にまで付けると、owner が別の質問をしただけでも app-server が旧 Mission を進め続ける。`null` と `未指定` を区別する必要がある。
- active Mission 中の新規別事業アイデアを同一 Mission に誤って吸収しないため、supersede 判定が必要。
- Mission JSON を prompt に丸ごと入れると token cost が増えるため compact context が必要。
- DO storage が thread-scoped なので cross-thread Mission lookup は別 index が必要。
- retry / pending replay が Mission を再作成せず同じ Mission を読むことを保証する必要がある。

## PR 前に確認すること

- Issue #845 の Success Criteria / Non-goal を再確認する。
- AGENTS.md Butler-first / authority / queue / strategy gate を再確認する。
- PR #846 merge 後の `main` に Business Mission core が存在すること。
- current DashboardChatRoom owner-message / pending replay / bridge prompt path を読む。
- existing tests の WebSocket send ordering / generated worker guard を確認する。

## 実装候補と捨てた案

採用:
- strong-intent only の Mission creation。
- DashboardChatRoom DO storage を initial runtime truth にする。
- app-server request と prompt へ compact Mission context を渡す。
- active Mission は mission-related follow-up turn だけで再利用する。
- unrelated turn は Mission state を消さずに context attachment だけ外す。
- strong new goal は kind / explicit switch / business anchor で supersede 判定する。

捨てた案:
- 全 owner turn を Mission 化する。
- Worker 内で LLM を別起動して Mission classification する。
- first runtime slice から App Store / Ads / Gmail を直接叩く。
- Mission を理由に deploy / external publish / spend boundary を緩める。
- Agent ごとに standing credential を付ける。

## merge 後に通す E2E

Issue #845 mapped E2E として、Dashboard Butler の通常チャットで「TOMIO を売れる状態まで持っていって」に相当する test Mission を開始し、同じ Mission ID が durable state / thread payload / app-server request / bridge prompt に保持され、通常 follow-up turn でも再利用されることを live-path相当のWebSocket E2Eで検証する。

## 次の PR を増やさない理由

この PR scope で Mission の入口・durable state・thread truth・bridge request・bridge prompt を一気に接続し、「Mission を作ったが VPS が知らない」「VPS は知るが reconnect で消える」という予測可能な穴を残さない。外部 connector と structured reconciliation は別 capability boundary であり、この runtime backbone に混ぜない。

## 停止条件

- ordinary conversation が Mission 化される regression が解消できない場合。
- Mission を通すために既存 high-risk authority boundary を緩める必要が出た場合。
- DashboardChatRoom / bridge reconnect の既存 continuity を壊す必要が出た場合。
- generated worker parity を保てない場合。

## Execution Queue Delta

- Queue position before: Issue #845 が `Now`、PR #846 core slice は merge 済み。
- Preemption decision: `ROOT`
- Queue delta: Issue #845 は `Now` のまま Dashboard Mission Runtime slice へ進む。Issue #741 は `Next` のまま active/incomplete を維持する。
- Why this PR is next: core Mission object だけでは owner burden は減らず、Dashboard Butler の通常チャットから durable Mission / VPS app-server context まで接続しない限り実利用できないため。
- Active Issues not downscoped: Issue #741 を含む existing active Issues are not downscoped。Issue #845 runtime backbone がそれらの上位 orchestration context を提供するだけで、既存 Issue の完了を主張しない。
