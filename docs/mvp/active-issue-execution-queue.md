# Active Issue Execution Queue

Issue: #595

This is the durable queue used to keep active VTDD work from collapsing into
whatever owner input or small fix appeared most recently.

This file is not a scope reducer. Active Issues remain in scope unless the owner
explicitly narrows the implementation window. This file records execution order,
preemption decisions, blockers, and evidence gaps.

Last initialized: 2026-05-28

## Queue Policy

- Treat owner input as a queue update event before treating it as implementation.
- Keep exactly one `Now` item unless an `EMERGENCY` preempts it.
- After `Now` completes and no human approval is required, continue to `Next`.
- Do not ask the owner to choose the next ready task when the queue already
  identifies it.
- Do not move an Issue out of active scope by labeling it `Queue`.
- Update this file when a PR materially changes queue position, blocker state, or
  evidence state.

## Now

- Issue #595: introduce the VTDD Execution Queue Contract and require PRs to
  declare queue delta before claiming progress.

## Next

- Rebuild the active Issue completion graph from open GitHub Issues after #595
  lands, using the categories below instead of treating all open Issues as a flat
  list.

## Root Blockers

- Issue #450: Dashboard Butler live runtime / app-server path remains the central
  owner-facing execution route blocker.
- Issue #528: Dashboard Butler must remain ChatGPT iOS-equivalent while debug /
  ops surfaces are isolated.
- Issue #413: VPS runner / Codex execution progress must be visible as
  owner-facing runtime truth.
- Issue #498: media attachments must reach the Butler / VPS analysis path, not
  merely local upload storage.
- Issue #355 and Issue #412: high-risk passkey / helper / GitHub App secret sync
  authority boundaries must not be mixed.

## Blocked

- Any deploy, credential mutation, permission mutation, repository administration,
  destructive cleanup, merge, post-merge Issue close, or merged-branch deletion
  remains blocked on the authority boundary in AGENTS.md.
- Production iPhone/PWA live evidence remains blocked unless the relevant PR
  scope explicitly authorizes live verification.

## Evidence Gaps

- Issue #582: local continuity evidence and PR #591 exist, but production
  iPhone/PWA live evidence and closure approval are not complete.
- Issue #587: local Simulator evidence exists for video attachment UI, but the
  Issue itself still requires full Butler Completion Gate evidence before closure.
- Issue #585, Issue #580, Issue #577, Issue #565, Issue #514, and related
  Dashboard UX Issues may have merged implementation slices; each still requires
  its own mapped completion evidence before being called done.

## Queue

- Issue #594: status intent latency should be handled as a queue/UX failure, but
  it must not replace the need for the assistant to manage the queue manually now.
- Issue #589 and Issue #590: notification and timeout recovery belong behind the
  Dashboard/runtime root blockers unless they become emergency incidents.
- Issue #573 and Issue #574: mobile layout polish stays active but must not
  preempt root execution unless it breaks the normal chat surface.
- Issue #354, Issue #491, Issue #492, Issue #495, Issue #497: ops, VPS,
  Cloudflare fallback, parity, usage, and public repo safety remain active
  operational work.
- Issue #415, Issue #356, Issue #358, Issue #417, Issue #448, Issue #501:
  memory, unknown-first, runaway stop, post-action orchestration, reviewer /
  auto-merge policy, and approve fallback remain active policy/runtime work.
- Issue #421 and Issue #455: nickname speed and cost/latency reductions remain
  active owner-experience work.

## Discovered

- None recorded in this file yet. New owner inputs and implementation discoveries
  should be classified here before they become new Issues or preempt current work.

## Required PR Delta

Every PR must state:

- current queue position,
- whether it preempts `Now`,
- which queue item moved,
- why that PR is next,
- confirmation that active Issues were not downscoped.

The PR body validator enforces the section name and fields; reviewers must still
check whether the content is honest.

## Grandfathered PRs

- PR #591 was opened before Issue #595 added `Execution Queue Delta`. The GitHub
  required check skips queue-delta enforcement for PR numbers lower than #596 so
  this process correction does not break already-open review work.
- If PR #591 is materially updated after this guardrail lands, its body should be
  updated to include the queue delta even though the workflow grandfathering keeps
  it mergeable.
