# Thread-independent startup contract

Issue: #344

This contract exists so VTDD work can resume from Butler, mac Codex, or VPS
Codex CLI without depending on the memory of one chat thread.

## 現行 executor 契約 — Issue #858

Owner の明示承認により **Mac PRIMARY / VPS STANDBY / Butler authority** を採用する。
iPhone/iPad の Dashboard Butler が主操作面、Mac が通常の実行基盤、VPS は
emergency / break-glass と固定費内の recovery 用待機基盤である。
active-active、自動 failover、自動 failback は禁止する。heartbeat 喪失は owner action
だけを生成し、実行権を移さない。手動切替は現在の policy が指定する正の relatedIssue・from/to・generation に
束縛した real passkey 承認を必要とする。切替 API は durable control state だけを更新し、
merge/deploy/root/credential 権限やプロセス操作を含まない。

VPS は Mac で app-server smoke 検証済みかつ owner 承認済みの exact Codex version だけに追従する。
Mac の bundled Codex 自動更新は PRIMARY の健康性を壊さず、versionApprovalPending と
未承認 candidate を表示する。承認済み版は standby sync の目標で、自動変更しない。
latest の推測、npm 自動更新は禁止。初期化も専用 passkey を必要とし、初回 report
から PRIMARY を推測しない。未初期化は Dashboard にそのまま表示する。
古い generation の復帰ノードは実行可能と扱わない。

transition は control-state 更新だけで activationPending=true。対象・旧新 generation・
relatedIssue・10分の期限を束縛した receipt を、対象側 helper がサーバーと照合して private
config に明示適用する。対象の新世代/receipt付き fresh heartbeat・running・smoke・承認済み版一致まで
「切替準備中」と表示する。
reporter はサーバー generation を自動取得・採用しない。共有 bearer のためノード本人性の
暗号学的証明はなく、偶発的な旧世代プロセス対策である。adversarial split-brain 防止とは
主張しない。receipt の期限切れからの再承認/recovery は未接続で、fail closed を維持する。

この隔離実装は control-state と実行前 admission fence を接続した slice である。
bridge の各turn/selector、VPS runner のqueue pickup/subprocess/GitHub write前にserverを照会する。
未初期化もbootstrap_requiredで拒否する。live設定・配置、installerのprovider-bound実行契約、
本番E2Eは未実施。進行中Codexの強制停止や認可と副作用の間の原子性は保証しない。
ローカル検証だけで運用全体の single-writer 完了を主張しない。

## Purpose

When a surface starts or resumes VTDD work, it must reconstruct the current
working frame from durable sources before proposing code, PR, merge, close,
deploy, or recovery action.

The goal is not to make startup verbose. The goal is to stop hidden
thread-local assumptions from becoming drift.

## Startup depth

Startup is risk-proportional.

### Minimal startup — default

For ordinary scoped implementation, read only:

1. the owner's current explicit instruction
2. current Mission or target Issue
3. current PR / branch truth when one exists
4. directly relevant source and tests
5. directly relevant canonical contract only when needed

Do not automatically read the whole active queue, all open Issues, all RAG,
all setup docs, or all historical PRs.

If a source was already read in the current run and its SHA/state has not
changed, reuse it.

### Full startup / preflight

Escalate to the full durable-source reconstruction when:

- thread or surface handoff occurs
- work resumes after unknown/stale state
- runtime truth conflicts
- ROOT / EMERGENCY preemption is being considered
- high-risk execution is requested
- an explicit status/readiness audit needs broad truth
- abandoned or ambiguous work is being resumed

Full startup may read:

1. the active GitHub Issue text and latest relevant comments
2. this contract and `AGENTS.md`
3. `docs/butler/execution-queue-contract.md` and the active queue
4. relevant GitHub runtime truth
5. relevant shared RAG / operational memory
6. current surface capability

If a required source cannot be read, say `未確認` or the exact error. Do not
replace it with a guess.

## Full startup report

When full startup/preflight is actually required, summarize in Japanese:

- target repository, Issue, PR, and branch, or `未確認`
- current surface and its limits
- runtime truth found
- relevant RAG/checkpoint hits found or missing
- thread-local assumptions that have been promoted into repo/RAG, or
  `threadLocalAssumptionsPromoted=false`
- expected files/routes/workflows and file/line hypotheses when known
- queue classification, current `Now`, preemption decision, and next automatic
  queue action
- cross-Issue or cross-surface risk
- next safe action and stop condition

This report is a guardrail for full startup cases. It is not required before
every ordinary edit, and it is not completion evidence.

## Shared behavior to preserve

- Do not rely on one chat thread's habits as authority. If a behavior matters
  after a thread switch, promote it into repo docs, Issue comments, or RAG.
- When a reusable fact is discovered, offer a compact RAG candidate and wait for
  `GO`. Store checkpoint/savepoint/current verification records as
  `working_memory`. Use `decision_log` only for rationale-backed decisions.
- RAG is shared memory for Butler, mac Codex, and VPS Codex CLI. It is not a
  Butler-only notebook.
- Unknowns and errors are first-class signals. Investigate them and preserve the
  reason when useful; do not quickly map them to familiar patterns.
- VTDD is iPhone/iPad-first at the operator surface. Butler routes normal execution
  to Mac PRIMARY. VPS STANDBY supports explicitly approved emergency recovery.
- Reconstruct executor generation, checkpoint, heartbeat, version and passkey scope
  before handoff; never infer automatic failover from Mac unavailability.
- Actor identity matters. If a role app cannot post as itself, do not silently
  substitute `marushu`; surface an owner-visible incident.
- Close comments are optional when the merged PR, tests, E2E evidence, and RAG
  record already preserve the reusable judgment. Do not add noisy closure
  comments just to perform ritual bookkeeping.
- Draft PRs or uncommitted work from another thread are runtime truth, not
  instructions to overwrite. Detect them, report them, and reconcile before
  continuing.

## Completion boundary

Adding or updating this contract does not complete Issue #344 by itself.
Issue #344 remains incomplete until Butler, mac Codex, and VPS Codex CLI can
show matching startup/preflight results with evidence.
