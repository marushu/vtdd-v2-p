# Issue #845 開発前作戦図 — Business Mission Core

## 完了体験

Owner は Butler に「TOMIO を売れる状態まで持っていって」「hibou の問い合わせを全部処理して」のように目的だけを伝える。Butler はそれを durable Mission に変換し、必要な workstream を役割別に並べ、reversible work は自動で前へ進め、high-risk / external side effect だけ既存の GO / passkey / approval boundary で owner に戻す。

この first slice の完了体験は、まだ外部サービス連携を完成扱いにしない。まず Mission schema / mission kind / workstream role registry / deterministic plan / authority classification / owner-facing summary を core として repo-backed にし、後続 runtime integration が同じ契約を使える状態にする。

## VTDD 全体で進める部分

- Butler の自然文 intent を「単発タスク」ではなく Mission として保持するための core contract。
- Product / Research / Development / QA / Performance / Release / Customer Support / Marketing / Analytics / Improvement の role registry。
- Worker 同士が直接 authority を引き継がず、Mission Orchestrator を経由する前提。
- reversible work と owner action 必須 work を action class で分離する authority classifier。
- product launch / customer inquiry / growth / operations の mission kind に応じた初期 workstream plan。
- owner-facing に agent 内部会話ではなく、現在地・次の自動行動・owner action を返す summary。

## 設計

新規 pure core module `src/core/business-mission-orchestrator.js` を作る。

Mission は最低限以下を持つ。

- `missionId`
- `ownerGoal`
- `target`
- `kind`
- `status`
- `successMetrics`
- `constraints`
- `budgetBoundary`
- `source`
- `createdAt`
- `workstreams`

Mission kind は明示値を優先し、未指定なら ownerGoal の lightweight deterministic signal から補完する。これは LLM の代替ではなく、runtime / tests で同じ contract を共有する fallback classifier とする。

Workstream は `role`, `purpose`, `dependsOn`, `defaultActionClass`, `status` を持つ。role registry は「人格」ではなく責務 / 入出力 / authority boundary を表す。

Authority は action class 単位にする。role 単位で権限を固定しない。

- `autonomous`: read / analyze / plan / draft / code / test / benchmark / PR create など reversible work
- `owner_go`: merge / external send / external publish / release submit など明示 GO が必要な外部効果
- `owner_passkey`: deploy / spend / contract / credential / permission / destructive / high-blast-radius mutation
- `forbidden`: 未定義または明示禁止

この slice では既存 `evaluateButlerExecution` を置き換えない。Mission core は既存 policy plane に authority class を渡す upstream planning layer とする。

## 仮説

現状 VTDD は Issue / PR / bounded Codex handoff / queue / approval の実装資産が厚いが、「owner goal を long-lived Mission にし、複数 domain workstream を継続させる」上位オブジェクトがない。そのため owner の新しいアイデアが毎回 Issue / task の粒度に落ち、owner 自身が交通整理を続けることになる。

Mission core を先に repo-backed にすれば、既存 #613 / #716 / #417 / #448 / #450 / #495 / #834 の runtime capability を一つの business-level goal の下に束ねられる。

## 検証計画

### Unit

- TOMIO 型 goal が `product_launch` に分類される。
- 問い合わせ型 goal が `customer_inquiry` に分類される。
- product launch plan に research → product → development → qa → performance → release → marketing → analytics → improvement が含まれる。
- customer inquiry plan に customer_support → analytics → improvement が含まれる。
- PR creation は autonomous、external send / publish は owner_go、deploy / spend / credential mutation は owner_passkey になる。
- unknown action は forbidden になる。
- owner-facing summary は agent 内部状態ではなく next autonomous actions / owner actions / blockers を返す。

### Integration

この slice では既存 Butler runtime route へまだ接続しない。次 slice で Dashboard Butler natural-language intake → Mission create → existing VPS Codex handoff / GitHub truth へ接続する。

### E2E

この slice 自体は unit/static contract evidence。Issue #845 completion には iPhone/PWA Butler から Mission が複数 workstream を進み、authority boundary で停止 / 再開する mapped E2E が別途必須。

## 改修見積もり

| Path | Boundary | Expected change | Risk |
| --- | --- | --- | --- |
| `docs/development-strategy/issue-845-business-mission-core.md` | strategy | この作戦図 | low |
| `src/core/business-mission-orchestrator.js` | new pure core module | schema / registry / planning / authority / summary | medium: future runtime contract になる |
| `test/business-mission-orchestrator.test.js` | unit tests | mission / planning / authority contract | low |
| `src/core/index.js` | public core exports | 新 module export | low |

## 既に通っている経路

- Butler natural-language / Dashboard / VPS Codex CLI の execution surface は既存 Issue 群で実装済みまたは active。
- bounded remote Codex handoff と GO boundary は `src/core/butler-orchestrator.js` などに存在する。
- GitHub runtime truth / PR / review / checks / queue / RAG / approval plane は既存資産を再利用する。
- execution queue contract と Butler Completion Gate は既存のまま維持する。

## 未確認の境界

- Mission durable store を Durable Object / D1 / RAG のどれへ置くかは runtime integration slice で決める。
- App Store Connect / ad platform / Gmail / WordPress / analytics の connector inventory と write authority は未接続。
- subagent process を Agents SDK 等で独立実行する transport はこの core slice では未接続。
- owner goal を LLM が structured Mission へ変換する production parser はこの slice では未接続。

## 穴が出そうな箇所

- role を authority と混同すると marketing Agent 等に過剰権限が付く。
- Mission kind classifier を賢くしすぎると prompt / LLM と二重実装になり drift する。
- workstream を固定 waterfall にすると実際の product / support flow に合わない。
- Mission を Issue と1:1にすると business goal が再び GitHub task 粒度へ縮む。
- runtime integration 時に Mission state と GitHub runtime truth の二重正本が生じる可能性がある。

## PR 前に確認すること

- Issue #845 の Intent / Success Criteria / Non-goal と一致していること。
- AGENTS.md の authority / Butler-first / queue / strategy gate を弱めていないこと。
- `npm test` で既存 tests を壊していないこと。
- `src/core/index.js` export に cyclic dependency を作っていないこと。
- Mission core が deploy / external send を直接実行しないこと。

## 実装候補と捨てた案

採用:
- pure core contract + registry + planner + authority classifier を先に作る。
- role と authority を分離する。
- existing Butler policy / runner を下位 execution plane として再利用する。

捨てた案:
- 最初から20 Agent を別 process として起動する。
- role ごとに standing credential を渡す。
- Mission core から直接 Gmail / App Store / Ads を叩く。
- self-modifying Butler が production code を無承認で書き換える。
- mac Codex 常駐を通常運用にする。

## merge 後に通す E2E

この core slice merge 後、次 slice で以下を通す。

1. Dashboard Butler へ test goal を自然文入力。
2. Mission を作成し durable truth に保存。
3. 少なくとも research / development / qa の3 workstream を route。
4. development を existing VPS Codex handoff へ渡す。
5. PR creation までは自動で到達。
6. merge / deploy / external publish は owner action required として停止。
7. owner approval 後に Mission が再開。
8. completion / KPI observation から improvement work item を生成。

## 次の PR を増やさない理由

この PR は Mission core contract だけに限定し、Dashboard route / Durable Object / external connector integration を混ぜない。上位 contract がないまま runtime を先に変更すると route ごとに mission shape が分裂するため、first slice として core を固定する。

## 停止条件

- Issue #845 と既存 authority policy が矛盾する場合。
- Mission core が merge / deploy / spend / external publish を直接許可する設計になった場合。
- runtime truth の authoritative source をこの slice で推測しなければ先へ進めない場合。
- existing tests が示す Butler boundary を壊さないと実装できない場合。

## Execution Queue Delta

- Queue position before: Issue #741 が durable queue の `Now`。Issue #845 は未登録。
- Preemption decision: `ROOT`
- Queue delta: Owner の現在の明示指示により Issue #845 を Business OS の root goal として追加し、この first slice を実装対象にする。Issue #741 を完了扱い・削除・downscope しない。
- Why this PR is next: owner が半年以上一貫して要求している「アイデアだけを渡し Butler が仕事全体を回す」上位 contract がなく、下位 capability が増えても owner の交通整理負担が減っていないため。
- Active Issues not downscoped: #741 を含む既存 active Issues は capability dependencies / blockers として残す。この PR は既存 root / evidence / queue state の完了を主張しない。
