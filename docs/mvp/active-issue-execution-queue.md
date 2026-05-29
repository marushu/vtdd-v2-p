# Active Issue Execution Queue

Issue: #595

This is the durable queue used to keep active VTDD work from collapsing into
whatever owner input or small fix appeared most recently.

This file is not a scope reducer. Active Issues remain in scope unless the owner
explicitly narrows the implementation window. This file records execution order,
preemption decisions, blockers, and evidence gaps.

Last rebuilt from GitHub runtime truth: 2026-05-29

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
  Issue #498, Issue #501, Issue #514, Issue #528, Issue #565,
  Issue #574, Issue #577, Issue #579, Issue #580, Issue #582, Issue #585,
  Issue #587, Issue #589, Issue #590, Issue #594, Issue #595, Issue #599,
  Issue #604, Issue #605, Issue #606, Issue #613, Issue #620.
- Recently closed as completed with evidence and owner approval: Issue #573,
  Issue #601, Issue #609.
- Open PRs read before this queue refresh PR was opened: none.
- Recent queue-changing merged PRs read: PR #591, PR #597, PR #598, PR #600,
  PR #602, PR #603, PR #607, PR #608, PR #610, PR #611, PR #612.
- Current queue rebuild scope: classify all open Issues without closing,
  downscoping, or treating any unverified Issue as done.
- 2026-05-29 owner input classified Issue #606 as `ROOT`: the 2-minute
  passkey grant coupling blocks the ordinary iPhone/PWA chat recovery path for
  Issue #579, Issue #590, Issue #604, and Issue #605. Issue #606 moves to
  `Now`; Issue #590 remains active and resumes after the read-session blocker
  no longer causes short-cycle reauthentication.
- 2026-05-29 Issue #606 was merged and production deployed. Owner live iPhone
  evidence reported Dashboard Butler still connected after 11 minutes, so the
  short-cycle passkey blocker no longer preempts Issue #590. Issue #590 moves
  back to `Now`; Issue #606 remains open until mapped completion evidence and
  human closure approval are complete.

## Now

- Issue #590: app-server turn timeout must become a recoverable Dashboard chat
  state after the short-cycle authentication blocker was removed by Issue #606
  implementation and production evidence.

## Next

- Issue #579: after timeout recovery, handle PWA background/foreground,
  WebSocket reconnect, auth/session expiry, and input/media retention.
- Issue #450 + Issue #413: continue the Dashboard Butler live runtime /
  app-server / VPS progress root after #590/#579 no longer leave ordinary chat
  stuck or opaque.

## Root Blockers

Root blockers hold multiple active Issues open. They should shape `Now` and
`Next` unless an `EMERGENCY` interrupts them.

- Issue #450: Dashboard Butler live runtime / app-server path remains the central
  owner-facing execution route blocker. It gates useful completion for Issue
  #528, Issue #579, Issue #590, Issue #594, and parts of Issue #498.
- Issue #528: Dashboard Butler must remain ChatGPT iOS-equivalent while debug /
  ops surfaces are isolated. It gates user-facing acceptance for Issue #574,
  Issue #577, Issue #580, Issue #582, Issue #585, Issue #587, Issue #589, and
  Issue #590.
- Issue #613: Dashboard Butler must become a Text-first / Voice-ready
  single-thread cross-repo work-control surface, not a repo-selected admin
  panel. It gates the product direction for Issue #528, Issue #450, Issue #413,
  Issue #415, Issue #498, Issue #514, Issue #590, Issue #594, Issue #604,
  Issue #605, and Issue #606.
- Issue #606: ordinary Dashboard read sessions must not reuse the same
  short-lived approval grant used for high-risk operations. It gates practical
  iPhone/PWA recovery for Issue #579, timeout recovery acceptance for Issue
  #590, and notification/context return for Issue #604 and Issue #605.
- Issue #413: VPS runner / Codex execution progress must be visible as
  owner-facing runtime truth. It gates completion claims for Issue #450,
  Issue #594, Issue #495, and recovery/ops workflows.
- Issue #498: media attachments must reach the Butler / VPS analysis path, not
  merely local upload storage. It gates Issue #587 and the owner-facing
  screenshot/video feedback loop.
- Issue #355: high-risk passkey / helper / GitHub App secret sync authority
  boundaries must not be mixed. It gates reliable recovery for reviewer,
  deploy, and secret maintenance.
- Issue #412: helper / GitHub App secret sync must preserve explicit authority
  boundaries before new high-risk workflow expansion.
- Issue #417: post-action orchestration must preserve approval boundaries before
  broader automatic next-step execution can be trusted.
- Issue #448: reviewer-approved auto-merge policy must preserve approval
  boundaries before broader automatic next-step execution can be trusted.

## Open PR Hygiene

- No open PRs were present before this refresh PR was opened. The current queue
  refresh PR is excluded from this hygiene snapshot.
- PR #591 / Issue #582 merged after adding queue-delta-compatible PR body
  evidence, reproducible local E2E, and reviewer-approved residual-risk
  handling. It still does not close Issue #582.
- PR #597 / Issue #528 merged Dashboard drawer/navigation usability work. Issue
  #528 remains a root blocker because production PWA evidence and the wider
  ordinary-chat-vs-ops separation are still incomplete.
- PR #598 / Issue #595 merged the first active Issue queue rebuild. This PR is a
  follow-up refresh after more queue-changing PRs merged.
- PR #600 / Issue #444 merged PR-first notification targets. Issue #444 remains
  active until live iPhone/PWA notification, sound, badge, and recovery evidence
  are complete.
- PR #602 / Issue #601 merged worker.js generation discipline before validation.
  Issue #601 was later closed as completed with owner approval.
- PR #603 / Issue #450 merged Dashboard traffic-control context preservation for
  the app-server bridge. It is partial path evidence, not full #450 completion.
- PR #607 / Issue #413 merged ready-by-default PR creation for the VPS runner.
  It removes Draft as an owner blocker, but it does not complete owner-facing
  execution progress visibility.
- PR #608 / Issue #595 merged the durable queue refresh that left Issue #590 as
  post-merge `Now`. Issue #595 remains open for runtime auto-classification
  parity.
- PR #610 and PR #611 / Issue #609 connected execution queue truth to startup
  preflight and Dashboard chat app-server bridge context. Issue #609 was later
  closed as completed with owner approval.
- PR #612 / Issue #573 fixed mobile horizontal scroll / side-to-side jitter.
  Issue #573 was later closed after production deploy and iPhone owner evidence.

## Evidence Gaps

Evidence gaps are active. They are not deferred out of scope.

- Issue #514: notification center / Web Push state has implementation slices, but
  live delivery and owner-facing send-result truth still need mapped evidence.
- Issue #528: PR #597 improved drawer width, notification navigation, viewport
  containment, and repo-context wording. Issue #528 still gates ordinary chat
  usability because connection recovery, notification delivery/recovery,
  attachment/video polish, operator/debug isolation, and production PWA evidence
  remain incomplete.
- Issue #450: PR #603 preserves traffic-control context through the Dashboard
  app-server bridge; ordinary conversation, follow-up continuity, timeout
  recovery, PWA recovery, readable final replies, and live owner-facing runtime
  truth remain incomplete.
- Issue #590: PR #628/PR #633 provide partial timeout-recovery evidence, but
  closure still needs mapped owner-facing production evidence that Dashboard
  Butler reports timeout/late completion before/after state without leaving the
  ordinary chat thread stuck.
- Issue #565: connection recovery status has local evidence, but completion still
  depends on the normal chat surface not being dominated by status noise.
- Issue #577: composer paste normalization has merged implementation slices, but
  still belongs to the Dashboard UX completion bundle.
- Issue #580: encoded trailing punctuation behavior has merged implementation
  slices, but remains part of link/URL acceptance until mapped evidence is
  complete.
- Issue #582: PR #583 and PR #591 are merged with local E2E evidence; production
  iPhone/PWA evidence, 10-turn completion matrix confirmation, and closure
  approval remain missing.
- Issue #585: markdown/link rendering has implementation slices; one-tap
  iPhone/PWA link behavior still needs mapped acceptance evidence.
- Issue #587: local Simulator evidence exists for video attachment UI; full
  Butler Completion Gate evidence is still missing.
- Issue #613: owner provided ChatGPT iOS app screenshots and live iPhone /
  QuickTime observations that define the Text-first / Voice-ready baseline, but
  Dashboard Butler implementation still needs mapped iPhone/PWA E2E.
- Issue #606: PR #627 merged and production deployed; owner live iPhone evidence
  reported Dashboard Butler still connected after 11 minutes. Issue closure still
  needs mapped completion evidence and explicit human closure approval.
- Issue #444: PR #600 points PR-numbered notifications at the PR instead of the
  Actions run, but live iPhone/PWA notification tap, sound, badge, and recovery
  evidence remain incomplete.

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
- Issue #599: PR and Issue titles should be Japanese-first.
- Issue #604: notification taps should open the relevant PR / Issue / deploy
  context directly.
- Issue #605: PR / deploy context drawer should be recoverable from
  notifications and conversation.
- Issue #620: dashboard AI news radar with PWA notifications.
- Issue #574: subtle lower-right chat timestamps.
- Issue #589: deploy notification non-delivery root-cause visibility.
- Issue #594: fast status intent / preflight index. This is important, but it is
  not a substitute for the assistant managing the queue manually now.

## Questions

- Issue #595: remains open because the runtime auto-classification path for
  Butler / VPS Codex CLI is not connected yet. This PR only refreshes the
  durable queue snapshot and intentionally leaves Issue #590 as post-merge
  `Now`.
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

- No open grandfathered PRs remain.
- Historical note: PR #591 was opened before Issue #595 added `Execution Queue
  Delta`, but its body was later updated to the current queue contract before it
  merged.
