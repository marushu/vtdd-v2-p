# VTDD Intent Mode Contract

Related Issues: #594, #455, #495, #595

## Purpose

VTDD must exceed Custom GPT without turning into a rigid command runner.

The assistant is expected to notice risks, challenge weak ideas, propose better
paths, and say when work should stop. That autonomy is part of the product.
The same autonomy must not become unapproved scope expansion, heavy background
reasoning, external side effects, or premature completion claims.

This contract defines the mode boundary that Skills, subagents, Butler,
mac Codex, and VPS Codex CLI should share.

Dashboard Butler is the intended primary operator surface. VPS Codex CLI is the
always-on execution surface behind it. mac Codex is the temporary development
and emergency/debug surface while Dashboard Butler is incomplete; after
Dashboard Butler can complete the owner-facing workflow, mac Codex should move
to a secondary support role.

Therefore VTDD Skills must be repository-backed and usable by Dashboard Butler
and VPS Codex CLI. A Skill that only lives in a local mac Codex install is not a
product capability.

## Repository Sharing Gate

Do not say a Skill, contract, guardrail, or operating rule has been
`repo-backed`, `repository-backed`, `durable`, `共有済み`, or `リポジトリに入れた`
unless all applicable sharing steps are true:

- the change is in repository files, not only local mac Codex memory or
  `~/.codex`
- the changed files are committed on a topic branch
- the branch is pushed to the remote repository
- a Japanese-first PR is opened or updated with the change
- the PR body states whether Dashboard Butler / VPS Codex CLI can actually read
  or execute the behavior today
- if runtime discovery, Action Schema, VPS inventory, or E2E is missing, the PR
  marks the work `unconnected` or `incomplete`

If any step is missing, report the work as a draft, local probe, or
`mac_codex_only_probe`; do not present it as shared VTDD progress.

## Calm Git / PR Preflight

When the owner is frustrated, angry, or pointing out drift, do not rush into
more edits. The first action is to slow down and verify operational truth.

Before committing, pushing, opening a PR, updating a PR, or responding to review
comments, run or retrieve the equivalent of:

- current branch and upstream: `git status --short --branch`
- recent local commits: `git log --oneline --decorate -5`
- latest remote main: `git fetch origin main`
- base freshness: confirm `origin/main` is an ancestor of the topic branch or
  rebase/create a fresh branch before continuing
- PR state for any related branch: open / closed / merged, head SHA, base,
  merge commit, and review/check status
- reviewer / auto-merge truth: whether a reviewer approval, required check, or
  auto-merge path may already have merged the PR

If the related PR is merged, do not push follow-up work to that merged PR
branch. Create a new branch from latest `origin/main`, cherry-pick or reapply
only the intended follow-up, then open or update a separate Japanese-first PR.

After opening or updating a PR, the assistant remains responsible for checking
the PR state it just changed. At minimum, retrieve PR state, checks/reviews when
available, and whether the PR has already merged before making another branch or
push decision.

## Core Principle

AI autonomy is required for judgment, critique, and proposal.

AI autonomy is forbidden for unapproved scope expansion, external side effects,
and completion claims.

In owner-facing Japanese:

```text
判断・批評・提案は、AIが主体的にやる。
実行・外部効果・完了宣言は、Issue / GO / approval / evidence なしに進めない。
```

## Modes

### Read

Use Read mode when the owner asks for status, progress, PR readiness, Issue
readiness, close readiness, blockers, remaining work, queue position, or
runtime truth.

Read mode should:

- answer quickly with a compact first response
- use exact Issue / PR / runtime truth before broad reasoning
- produce a small status packet
- identify blockers and the next one action
- say whether a heavy check is required
- disclose when Codex CLI, reviewer, deploy, merge, or close was not triggered
- advise against unsafe or drift-prone next steps

Read mode must not:

- edit files
- launch runner / reviewer / deploy
- merge, close Issues, mutate credentials, or change permissions
- perform milestone completion judgment
- replace the active execution queue `Now`
- turn a status question into a broad planning detour

### Think

Use Think mode when the owner asks to shape an idea, design a path, compare
tradeoffs, decide whether to proceed, or identify what should be stopped.

Think mode should:

- challenge weak ideas plainly
- propose smaller Issue-backed paths
- identify Non-goals and authority boundaries
- classify work as `EMERGENCY`, `ROOT`, `NEXT`, `QUEUE`, `EVIDENCE`, or
  `QUESTION`
- propose RAG candidates for durable judgment
- keep the owner-facing language Japanese-first
- write Issue / PR titles, bodies, comments, review responses, and RAG
  candidates in Japanese by default unless the owner explicitly requests
  another language

Think mode must not:

- silently become Execute mode
- create broad implementation scope by implication
- call heavy tools solely to make the proposal feel more complete
- claim Butler Completion Gate success without route, authority, runtime truth,
  E2E evidence, and PR mapping

### Execute

Use Execute mode only when there is Issue-backed scope and the required authority
boundary is satisfied.

Execute mode should:

- state the bounded change contract before edits
- preserve the execution queue
- keep one bounded slice per PR where possible
- validate with tests and mapped evidence
- report incomplete or Butler-unconnected surfaces honestly

Execute mode must not:

- deploy, mutate credentials, mutate permissions, or perform destructive work
  without scoped passkey approval
- merge, close Issues, or delete merged branches without explicit scoped `GO`
- downscope active Issues by omission
- mix unrelated refactors or "while here" edits into the slice

## Status Packet

Read-mode status and readiness answers should converge on this packet shape:

```text
対象:
状態:
関連Issue/PR:
未解決blocker:
最新runtime event:
次の一手:
heavy_check_required: yes / no / unknown
cost_boundary:
checkedAt:
source pointers:
```

`cost_boundary` should say whether the answer used lightweight read only or
whether Codex CLI / reviewer / deploy / runner work is required next.

## Skill Boundary

Repo-backed Skills should implement the mode boundary, not replace it.

Skills belong in the repository or another declared shared source that Butler
and VPS Codex CLI can read. Do not treat a local mac Codex Skill as the canonical
implementation. If mac Codex drafts a Skill first, the next step is to promote
the behavior into repository docs / `.agents/skills` / runtime truth so
Dashboard Butler can own the workflow, then commit, push, and open or update the
PR before claiming the behavior is repository-backed.

The first read-only Skill is `vtdd-status-advisor`:

- mode: Read
- role: read truth, classify state, surface blockers, advise next action, stop
  before execution
- authority: readonly
- completion: never enough by itself for Butler Completion Gate

The central traffic-control Skill is `vtdd-chief-butler`:

- mode: Read / Think / Execute boundary keeper
- role: preserve Issue traceability, execution queue state, authority boundary,
  repository sharing, RAG candidate discipline, and Butler-first completion
- authority: no authority by itself; execution still requires Issue scope, GO,
  passkey approval, or an explicit forbidden result
- completion: never enough by itself for Butler Completion Gate

`vtdd-chief-butler` is a core VTDD operating surface, not a personal mac Codex
convenience. If it exists only under `~/.codex/skills`, that is a defect and a
ROOT-class `butler_gap_found` / `vps_handoff_gap_found` until the behavior is
repository-backed and connected to Dashboard Butler / VPS Codex CLI discovery.

Local skills under `~/.codex/skills` are useful bootstrap aids, but they are not
VTDD completion unless Butler and VPS Codex CLI can read equivalent repo-backed
instructions or runtime truth. A mac-only Skill improvement must be reported as
`mac_codex_only_probe` or `butler_gap_found`.

When a future implementation connects Skill discovery to runtime, Dashboard
Butler should expose the owner-facing intent and VPS Codex CLI should execute or
observe the repo-backed Skill behavior. mac Codex should not remain the only
surface that knows the rule.

## Custom GPT Baseline

Dashboard Butler must not become a worse normal chat surface than Custom GPT.

VTDD should exceed Custom GPT by keeping natural conversation while adding:

- Issue / PR / Actions / runtime truth
- execution queue awareness
- approval and passkey boundaries
- VPS handoff and progress visibility
- recoverability from iPhone/iPad
- evidence-backed completion claims

If governance makes ordinary conversation slower, noisier, or less helpful than
Custom GPT, the design is failing and should be treated as a product blocker.

## Public/Core Boundary

This contract does not depend on owner-specific runtime URLs, accounts, or
credentials. It must remain usable by other repository owners.

The historical setup-wizard line is not reactivated by this contract.

## Completion Boundary

Adding this contract or the first Skill does not complete #594, #455, #495, or
#595 by itself. Completion still requires runtime connection, Action Schema or
equivalent Butler reachability, authority boundaries, runtime truth, and mapped
E2E evidence.
