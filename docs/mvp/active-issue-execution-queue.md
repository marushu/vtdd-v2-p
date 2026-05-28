# Active Issue Execution Queue

Issue: #595

This is the durable queue used to keep active VTDD work from collapsing into
whatever owner input or small fix appeared most recently.

This file is not a scope reducer. Active Issues remain in scope unless the owner
explicitly narrows the implementation window. This file records execution order,
preemption decisions, blockers, and evidence gaps.

Last rebuilt from GitHub runtime truth: 2026-05-28

## Queue Policy

- Treat owner input as a queue update event before treating it as implementation.
- Keep exactly one `Now` item unless an `EMERGENCY` preempts it.
- After `Now` completes and no human approval is required, continue to `Next`.
- Do not ask the owner to choose the next ready task when the queue already
  identifies it.
- Do not move an Issue out of active scope by labeling it `Queue`.
- Update this file when a PR materially changes queue position, blocker state, or
  evidence state.
- A new Issue must be classified as `EMERGENCY`, `ROOT`, `NEXT`, `QUEUE`,
  `EVIDENCE`, or `QUESTION` before it can change `Now`.

## Runtime Truth Snapshot

- Open Issues read: Issue #354, Issue #355, Issue #356, Issue #358, Issue #412,
  Issue #413, Issue #415, Issue #417, Issue #421, Issue #444, Issue #448,
  Issue #450, Issue #455, Issue #491, Issue #492, Issue #495, Issue #497,
  Issue #498, Issue #501, Issue #514, Issue #528, Issue #565, Issue #573,
  Issue #574, Issue #577, Issue #579, Issue #580, Issue #582, Issue #585,
  Issue #587, Issue #589, Issue #590, Issue #594, Issue #595.
- Open PRs read: PR #591, PR #597.
- Current queue rebuild scope: classify all open Issues without closing,
  downscoping, or treating any unverified Issue as done.

## Now

- Issue #595 / PR to be created: rebuild this active Issue completion graph from
  current GitHub runtime truth.

## Next

- PR #597 / Issue #528: repair the PR body by adding `Execution Queue Delta` and
  re-run checks. This is next because it is already open, mergeable in code
  shape, and currently blocked by the newly merged #595 guardrail rather than by
  implementation tests.
- PR #591 / Issue #582: after PR #597 is unblocked or explicitly paused, refresh
  mergeability and decide whether it remains an `EVIDENCE` gap or needs a queue
  delta update despite grandfathering.
- Issue #450 + Issue #413: resume the Dashboard Butler live runtime /
  app-server / VPS progress root after open PR hygiene is under control.

## Root Blockers

Root blockers hold multiple active Issues open. They should shape `Now` and
`Next` unless an `EMERGENCY` interrupts them.

- Issue #450: Dashboard Butler live runtime / app-server path remains the central
  owner-facing execution route blocker. It gates useful completion for Issue
  #528, Issue #579, Issue #590, Issue #594, and parts of Issue #498.
- Issue #528: Dashboard Butler must remain ChatGPT iOS-equivalent while debug /
  ops surfaces are isolated. It gates user-facing acceptance for Issue #573,
  Issue #574, Issue #577, Issue #580, Issue #582, Issue #585, Issue #587,
  Issue #589, and Issue #590.
- Issue #413: VPS runner / Codex execution progress must be visible as
  owner-facing runtime truth. It gates completion claims for Issue #450,
  Issue #594, Issue #495, and recovery/ops workflows.
- Issue #498: media attachments must reach the Butler / VPS analysis path, not
  merely local upload storage. It gates Issue #587 and the owner-facing
  screenshot/video feedback loop.
- Issue #355 and Issue #412: high-risk passkey / helper / GitHub App secret sync
  authority boundaries must not be mixed. They gate reliable recovery for
  reviewer/deploy/secret maintenance and must stay ahead of new high-risk
  workflow expansion.
- Issue #417 and Issue #448: post-action orchestration and reviewer-approved
  auto-merge policy must preserve approval boundaries before broader automatic
  next-step execution can be trusted.

## Open PR Hygiene

- PR #597 / Issue #528 is blocked by `guarded-policy` because it was opened after
  PR #596 and lacks `Execution Queue Delta`. It must be updated before it can be
  treated as merge-ready.
- PR #591 / Issue #582 is grandfathered by PR number. Grandfathering only avoids
  breaking already-open work; it does not make Issue #582 complete and should not
  be copied into future PR bodies.

## Evidence Gaps

Evidence gaps are active. They are not deferred out of scope.

- Issue #514: notification center / Web Push state has implementation slices, but
  live delivery and owner-facing send-result truth still need mapped evidence.
- Issue #565: connection recovery status has local evidence, but completion still
  depends on the normal chat surface not being dominated by status noise.
- Issue #577: composer paste normalization has merged implementation slices, but
  still belongs to the Dashboard UX completion bundle.
- Issue #580: encoded trailing punctuation behavior has merged implementation
  slices, but remains part of link/URL acceptance until mapped evidence is
  complete.
- Issue #582: PR #591 exists and local E2E exists; production iPhone/PWA evidence
  and closure approval remain missing.
- Issue #585: markdown/link rendering has implementation slices; one-tap
  iPhone/PWA link behavior still needs mapped acceptance evidence.
- Issue #587: local Simulator evidence exists for video attachment UI; full
  Butler Completion Gate evidence is still missing.

## Blocked

- Any deploy, credential mutation, permission mutation, repository administration,
  destructive cleanup, merge, post-merge Issue close, or merged-branch deletion
  remains blocked on the authority boundary in AGENTS.md.
- Production iPhone/PWA live evidence remains blocked unless the relevant PR
  scope explicitly authorizes live verification.
- Issue #354: VPS maintenance apply/reboot paths are blocked on explicit GO and
  careful authority design even if status/check paths can be designed first.
- Issue #355 / Issue #412: live secret sync verification is blocked on safe
  approval-grant and helper/origin handling; do not shortcut through mac-only
  manual sync as product completion.

## Queue

These Issues remain active and required, but they do not preempt the current
`Now` unless they become `EMERGENCY` or a newly discovered `ROOT`.

- Issue #354: VPS maintenance workflow for status / security update / reboot via
  GitHub Actions.
- Issue #356: unknown-first behavior and repair-case memory candidate flow.
- Issue #358: runaway AI / workflow stop and self-detection.
- Issue #415: meaningful memory checkpoint and exploration hypothesis recording.
- Issue #421: nickname read as shortest useful Action.
- Issue #444: iOS PWA notification, sound, and badge.
- Issue #455: Codex usage and latency reduction.
- Issue #491: Cloudflare fallback design.
- Issue #492: VPS usage digest readable from Butler.
- Issue #495: VPS Codex CLI skill/plugin/MCP parity with mac Codex.
- Issue #497: periodic public-repo secret / dependency / owner-specific artifact
  scan.
- Issue #501: same-head fallback requested after Gemini approve.
- Issue #573: mobile horizontal scroll / side-to-side jitter.
- Issue #574: subtle lower-right chat timestamps.
- Issue #589: deploy notification non-delivery root-cause visibility.
- Issue #590: app-server turn timeout as recoverable chat state.
- Issue #594: fast status intent / preflight index. This is important, but it is
  not a substitute for the assistant managing the queue manually now.

## Questions

- Issue #595 remains open because the runtime auto-classification path for
  Butler / VPS Codex CLI is not connected yet.
- Decide in a future bounded slice whether `docs/mvp/active-issue-execution-queue.md`
  should be generated from GitHub runtime truth or remain hand-curated with tests.

## Discovered

- None recorded in this rebuild. New owner inputs and implementation discoveries
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
