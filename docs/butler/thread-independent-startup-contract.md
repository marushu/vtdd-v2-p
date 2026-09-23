# Thread-independent startup contract

Issue: #344

This contract exists so VTDD work can resume from Butler, mac Codex, or VPS
Codex CLI without depending on the memory of one chat thread.

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
- VTDD is iPhone/iPad-first. A Mac-dependent path is a fallback or maintenance
  path, not the normal Butler completion path.
- Butler -> VPS Codex CLI is the preferred always-on execution direction when a
  task requires repo-backed natural-language development without the owner's Mac.
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
