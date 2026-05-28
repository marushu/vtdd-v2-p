# VTDD Execution Queue Contract

Issue: #595

This contract exists so Butler, mac Codex, and VPS Codex CLI do not turn every
owner complaint, idea, or frustration into an immediate implementation detour.

The owner may keep throwing problems, ideas, anger, screenshots, edge cases, and
new requirements into the system. The assistant must act as chief butler: classify
the input, update the execution queue, protect the current root blocker unless a
real preemption condition is met, and continue without asking the owner to do
project management.

## Core Rule

Owner input is a queue update event before it is an implementation instruction.

Before acting on new owner input, classify it as exactly one of:

- `EMERGENCY`: security exposure, data loss, runaway automation, broken main,
  credential accident, deploy incident, or other high-blast-radius stop condition.
- `ROOT`: a blocker that prevents multiple active Issues from reaching the Butler
  Completion Gate.
- `NEXT`: a dependency that should run immediately after the current `Now` item.
- `QUEUE`: required work that must remain in scope but must not preempt the current
  root blocker.
- `EVIDENCE`: implementation likely exists, but mapped E2E, runtime truth, PR body
  evidence, or human closure approval is missing.
- `QUESTION`: owner judgment, GO, passkey approval, platform authority, or an
  unresolved product decision is required before safe execution.

Do not treat `QUEUE` as deferred out of scope. It remains active work.

## Preemption Rules

Only `EMERGENCY` automatically interrupts `Now`.

`ROOT` may reorder the queue only after the assistant states:

- which active Issues it blocks,
- which completion-gate column is blocked,
- what current `Now` work would be paused,
- why continuing the current item first would create drift or wasted work.

`NEXT`, `QUEUE`, and `EVIDENCE` must be recorded in the active issue execution
queue and must not silently replace `Now`.

`QUESTION` stops only the affected branch of work. It must not freeze unrelated
ready work unless the unresolved decision changes the root plan.

## Required Queue State

The active queue must expose:

- `Now`: the one bounded Issue / PR slice currently being executed.
- `Next`: the next slice to start automatically when `Now` is done and no GO /
  passkey / external authority is required.
- `Root Blockers`: current blockers that hold multiple active Issues open.
- `Blocked`: items waiting for GO, passkey approval, external platform truth,
  deploy authority, credentials, or human judgment.
- `Evidence Gaps`: items with implementation or partial PR evidence but missing
  mapped E2E, runtime truth, or closure approval.
- `Queue`: required active work that does not preempt the current root.
- `Discovered`: new Issue candidates found during work but not yet authored or
  classified against active scope.

## PR Requirement

Every PR that changes docs, runtime, tests, workflows, templates, or process
guardrails must include an `Execution Queue Delta` section with:

- `Queue position before`
- `Preemption decision`
- `Queue delta`
- `Why this PR is next`
- `Active Issues not downscoped`

If a PR cannot explain its queue delta, it is a drift risk and must not be opened
as implementation progress.

The `Preemption decision` field must name one queue classification:
`EMERGENCY`, `ROOT`, `NEXT`, `QUEUE`, `EVIDENCE`, or `QUESTION`.

The `Queue delta` field must name the Issue/PR or queue bucket being moved. A
valid entry is concrete, for example:

- `Issue #595 moves to Now; Next remains active Issue completion graph rebuild.`
- `Issue #582 stays Evidence Gaps until production iPhone/PWA E2E exists.`
- `PR #591 remains open and is grandfathered from queue-delta enforcement until
  it is updated for the new contract.`

The `Active Issues not downscoped` field must explicitly say active Issues were
not shrunk, deferred out of scope, or treated as complete by omission.

## Backward Compatibility

The GitHub required check enforces `Execution Queue Delta` for PR #596 and later.
Older already-open PRs are grandfathered by PR number so this guardrail does not
break existing review work solely because their body was written before Issue
#595 existed.

Grandfathering is not a completion shortcut. When an older PR is materially
rewritten, rebased, or used as a template for new work, update its PR body to the
current queue contract.

## Startup Requirement

Before starting or resuming Issue-backed work, read:

1. `AGENTS.md`
2. `docs/butler/thread-independent-startup-contract.md`
3. this file
4. `docs/mvp/active-issue-execution-queue.md`
5. the target Issue and open PR runtime truth

If any source is unavailable, report `未確認` and do not replace it with memory.

## Reporting Requirement

Progress reports must name queue movement, not just local edits:

- `Now` item advanced or blocked.
- completion-gate column changed.
- Issue moved between `Root Blockers`, `Evidence Gaps`, `Blocked`, or `Queue`.
- next automatic action.
- stop condition, if any.

Do not report "done" when the queue still marks the Issue as evidence-missing,
blocked, unconnected, or incomplete.

## Boundary

This contract does not shrink MVP, active Issue coverage, or Butler Completion
Gate requirements. It exists to prevent the assistant from chasing the most
recent input while the root system remains unfinished.
