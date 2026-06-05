# Active Issue Execution Queue

Issue: #595

This is the durable queue used to keep active VTDD work from collapsing into
whatever owner input or small fix appeared most recently.

This file is not a scope reducer. Active Issues remain in scope unless the owner
explicitly narrows the implementation window. This file records execution order,
preemption decisions, blockers, and evidence gaps.

Last rebuilt from GitHub runtime truth: 2026-06-05

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
  Issue #498, Issue #501, Issue #514, Issue #528, Issue #574, Issue #579,
  Issue #582, Issue #585, Issue #587, Issue #589, Issue #590, Issue #594,
  Issue #595, Issue #599, Issue #604, Issue #605, Issue #606, Issue #613,
  Issue #620, Issue #634, Issue #637, Issue #651, Issue #654, Issue #657,
  Issue #667, Issue #670, Issue #689, Issue #698, Issue #703, Issue #716,
  Issue #717, Issue #722, Issue #723, Issue #741, Issue #744, Issue #745,
  Issue #748, Issue #793.
- Recently closed as completed with evidence and owner approval: Issue #573,
  Issue #565, Issue #577, Issue #580, Issue #601, Issue #609.
- Open PRs read before this queue refresh PR was opened: none.
- Recent queue-changing merged PRs read: PR #591, PR #597, PR #598, PR #600,
  PR #602, PR #603, PR #607, PR #608, PR #610, PR #611, PR #612, PR #685,
  PR #686, PR #688, PR #690, PR #774, PR #775, PR #776, PR #777, PR #778,
  PR #779, PR #780, PR #781, PR #782, PR #783, PR #784, PR #785, PR #786,
  PR #787, PR #788, PR #789, PR #790, PR #791, PR #792.
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
- 2026-05-29 owner input classified Issue #637 as `ROOT`: PR #632 exposed that
  VPS root/sudo maintenance still requires Mac SSH when Playwright Chromium
  dependencies, Codex sandbox sysctls, or runner service recovery are missing.
  This blocks iPhone/PWA-only recovery for Issue #413, Issue #450, Issue #514,
  Issue #590, Issue #631, and future VPS Codex CLI work. Issue #637 moves to
  `Now`; Issue #590 and PR #632 remain active but should not run in parallel
  while the privileged-maintenance authority path is being organized.
- 2026-05-29 PR #652 merged Issue #651 same-head conflicting reviewer evidence
  gate. Issue #651 remains open because mapped live/E2E close-readiness is not
  complete.
- 2026-05-29 owner input classified the missing repo-backed
  `vtdd-chief-butler` traffic-control Skill as `ROOT`: mac Codex had a local
  chief-butler Skill that Dashboard Butler and VPS Codex CLI could not
  necessarily read. This is Issue #495 / Issue #595 partial scope and must be
  treated as `butler_gap_found` plus `vps_handoff_gap_found` until repo-backed
  Skill, runtime discovery, VPS inventory, and E2E evidence are connected.
- 2026-05-30 PR #685 merged Issue #654's stale Dashboard HTTP fallback reply
  fix. Issue #654 remains open because reconnect/resume and app-server bridge
  continuation are still not complete.
- 2026-05-30 PR #686 merged Issue #579 local mobile reconnect/auth evidence.
  Issue #579 remains open because production iPhone/PWA live evidence and
  attachment candidate recovery are still missing.
- 2026-05-31 Issue #565, Issue #577, and Issue #580 were closed after
  main/runtime truth was re-read and close evidence was posted. These are narrow
  Dashboard polish slices and do not close Issue #528, Issue #579, Issue #590,
  or Issue #654.
- 2026-06-01 PR #712 exposed a completion-read drift: HTTP persistence had been
  treated as owner-facing send readiness even though `/v2/dashboard/chat/messages`
  is not the live app-server bridge path. Issue #654 is not close-ready until
  Dashboard normal chat stays on WebSocket, preserves unacknowledged owner input,
  and resends it after reconnect with mapped live evidence.
- 2026-05-31 Issue #579 received production Dashboard Butler draft-retention and
  same-thread response evidence. Owner live evidence from 2026-05-30 16:00-19:00
  JST is accepted as practical Mac Chrome / Cloudflare Access stability evidence,
  not as a substitute for iPhone/PWA lock/suspend evidence. Attachment candidate
  retention is split to Issue #498 / Issue #587 rather than keeping Issue #579
  open for media scope alone. Issue #579 remains an evidence gap until final
  iPhone/PWA lock/suspend recovery evidence or human scope judgment says that
  column is satisfied.
- 2026-05-31 Issue #689 was created from owner input about LINE-like reply
  target previews. It is classified as `QUEUE` and must not preempt the current
  Now item.
- 2026-06-01 owner input classified Issue #590 as `ROOT`: Dashboard Butler
  conversation timeout / silent wait recovery blocks continued iPhone/PWA
  development itself. If Butler cannot keep responding while app-server activity
  is still progressing, the owner must return to mac Codex to recover, which
  blocks Issue #637 and the broader Butler-first operating center. Issue #590
  moves to `Now` for the app-server activity watchdog slice; Issue #637 resumes
  after this recovery path no longer interrupts ordinary development.
- 2026-06-01 owner live evidence classified Issue #723 as `ROOT` support for
  Issue #590: after PR #721 merged and deploy-production succeeded, Dashboard
  Butler still showed the old fixed 2-minute timeout until the owner manually
  reloaded the PWA. This blocks Issue #590 validation because stale Dashboard
  client / service worker / WebSocket session state can hide the actual runtime
  behavior. Issue #723 temporarily becomes `Now` to add owner-facing freshness
  check and force cache refresh; Issue #590 remains the parent root and resumes
  immediately after stale-client recovery no longer masks the watchdog.
- 2026-06-01 PR #724 merged and deploy-production succeeded for Issue #723.
  Owner production PWA evidence confirmed the freshness controls exist in the
  left navigation menu and `強制キャッシュ削除リロード` can be executed. The
  owner also confirmed the menu placement is acceptable because keeping the
  control resident in the main chat would be noisy. Issue #723 remains open
  until evidence is posted and close-readiness is judged, but it no longer
  needs to hold `Now`; Issue #590 resumes as the parent root.
- 2026-06-02 PR #731 merged and deploy-production succeeded for Issue #590.
  Owner production PWA evidence and app-server bridge production probing
  confirmed low-information `考えています。` / `コマンドを実行しています。`
  progress no longer pollutes durable chat history. Issue #590 remains `Now`
  because the owner-facing long-turn experience is still incomplete: transient
  progress must be visible without chat-history spam, and completion should
  leave a readable final summary instead of a trail of low-value progress.
- 2026-06-04 production evidence showed Issue #590 remained incomplete after
  multiple live-progress slices: owner-facing progress appeared late,
  low-value transport status leaked into the wrong lane, scroll position could
  be stolen, and final summaries lacked important queue / PR / runtime links.
  Follow-up PRs #774 through #783 improved final progress summary, realtime
  checkpoint stream, scroll guard, fallback checkpoint, reply-delta progress,
  media-aware recovery, context-window reset, and related bridge behavior, but
  mapped production completion evidence is still missing.
- 2026-06-05 PR #789 and PR #790 repaired Issue #455 app-server regressions
  exposed while continuing Issue #590: unsupported-model backend thread recovery
  and Codex CLI threadSource protocol drift. These are partial runtime recovery
  slices, not Issue #455 completion.
- 2026-06-05 PR #791 merged Issue #590 app-server request stall recovery. It
  prevents a `thread/start` / `turn/start` request stall from leaving no
  final/failed Dashboard event, but production deploy and iPhone/PWA live E2E
  remain required before Issue #590 can advance out of `Now`.
- 2026-06-05 PR #792 merged Issue #613 single main Dashboard chat thread
  runtime routing. It stops Worker runtime paths from generating repo-derived
  main chat threads, but production deploy, PWA E2E, VPS env cleanup, and
  historical thread migration remain incomplete.
- 2026-06-05 Issue #793 was created from owner agreement on deploy notification
  driven stale-client refresh. It is a follow-up to Issue #723 and related to
  Issue #590 / Issue #654 / Issue #514, but it is classified as `QUEUE` and
  does not preempt the current root blocker.

## Now

- Issue #590: app-server turn timeout / silent wait recovery. Fixed 2-minute
  conversation death and durable low-information progress spam are mitigated in
  production. PR #791 adds request-stall recovery, but the current root blocker
  remains owner-facing observability and recovery evidence: longer Dashboard
  Butler work must show readable live progress, avoid low-value transport spam,
  keep scroll/draft/thread state stable, preserve important evidence links in
  final summaries, and prove the recovery path in production PWA after deploy.

## Next

- Issue #637: iPhone/PWA-complete VPS privileged maintenance capability
  lifecycle resumes after Issue #590 no longer blocks ordinary Dashboard Butler
  conversation continuity.
- Issue #450 / Issue #654 reconnect-resend correction: remove conversation
  claims from HTTP persistence, keep normal chat on WebSocket, and verify
  unacknowledged owner messages are resent after reconnect.

## Root Blockers

Root blockers hold multiple active Issues open. They should shape `Now` and
`Next` unless an `EMERGENCY` interrupts them.

- Issue #450: Dashboard Butler live runtime / app-server path remains the central
  owner-facing execution route blocker. It gates useful completion for Issue
  #528, Issue #579, Issue #590, Issue #594, and parts of Issue #498.
- Issue #637: VPS privileged maintenance must be reachable from iPhone/PWA with
  scoped passkey approval, PWA owner-action notification, root-owned helper
  execution, capability add/disable/remove/rollback/review, and redacted runtime
  truth. It gates Issue #413, Issue #450, Issue #514, Issue #590, Issue #631,
  and future VPS Codex CLI work whenever root/sudo host capability is missing.
- Issue #495: VPS Codex CLI skill/plugin/MCP parity is a root blocker whenever
  mac Codex uses local Skills, plugins, or connectors that Dashboard Butler and
  VPS Codex CLI cannot inventory or reproduce. The `vtdd-chief-butler` gap is
  evidence that traffic-control behavior must be repo-backed and then connected
  to runtime discovery before VTDD can claim cross-surface consistency.
- Issue #528: Dashboard Butler must remain ChatGPT iOS-equivalent while debug /
  ops surfaces are isolated. It gates user-facing acceptance for Issue #574,
  Issue #582, Issue #585, Issue #587, Issue #589, Issue #590, and Issue #634.
- Issue #613: Dashboard Butler must become a Text-first / Voice-ready
  single-thread cross-repo work-control surface, not a repo-selected admin
  panel. It gates the product direction for Issue #528, Issue #450, Issue #413,
  Issue #415, Issue #498, Issue #514, Issue #590, Issue #594, Issue #604,
  Issue #605, and Issue #606. PR #792 merged the first runtime thread-routing
  slice, but production PWA E2E and VPS cleanup are still incomplete.
- Issue #748: presence / voice / progress must be cost-aware before broader
  voice-ready or high-frequency progress work. It gates Issue #613 voice work,
  Issue #590 progress lane design, and Issue #455 cost discipline by requiring
  presence to stay distinct from persistence.
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
- PR #627 / Issue #606 separated Dashboard read sessions from high-risk
  approval grants. Issue #606 remains open for mapped live evidence and closure
  approval.
- PR #652 / Issue #651 and PR #668 / Issue #667 tightened auto-merge reviewer
  evidence gates. Both Issues remain open until mapped close-readiness evidence
  is complete.
- PR #684 / Issue #590 added local Dashboard timeout recovery E2E. Issue #590
  remains open for production Dashboard Butler evidence.
- PR #685 / Issue #654 removed stale fallback replies from normal Dashboard chat.
  Issue #654 remains open for reconnect/resume and bridge continuation.
- PR #712 / Issue #528 was reclassified as a regression because it displayed
  HTTP persistence as send-ready chat. Follow-up work must remove that owner-facing
  claim and keep conversation completion on the WebSocket live path.
- PR #686 / Issue #579 added local Dashboard PWA reconnect/auth evidence. Issue
  #579 remains open for production iPhone/PWA live evidence and attachment
  candidate recovery.
- Issue #565, Issue #577, and Issue #580 were closed on 2026-05-31 with
  evidence comments after merged PRs and current production setup truth were
  re-read.
- PR #774 through PR #783 / Issue #590 merged live-progress, final-summary,
  scroll, fallback, media-aware recovery, and context-reset slices. These PRs are
  progress evidence only; owner production evidence still reports incomplete
  realtime progress and lane separation.
- PR #785 through PR #791 repaired Issue #590 / Issue #455 app-server context,
  unsupported-model, protocol drift, and request-stall failure modes. They keep
  Dashboard Butler usable but do not close Issue #590 or Issue #455 without
  production deploy/live E2E evidence.
- PR #792 / Issue #613 merged single main Dashboard chat runtime normalization.
  It is partial #613 progress and does not perform production deploy, VPS env
  cleanup, or historical thread migration.

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
- Issue #590: PR #731 and production deploy evidence show low-information
  progress no longer pollutes durable chat history. Closure still needs mapped
  production owner-facing evidence for the remaining long-turn UX: transient
  progress visibility, final summary replacement, same-thread follow-up /
  cancel / interrupt handling, clear late-completion behavior, request-stall
  recovery after PR #791, evidence-link preservation, and scroll-safe live
  progress lane behavior.
- Issue #651: PR #652 merged a same-head conflicting reviewer evidence gate, but
  live/mapped E2E close-readiness evidence is still missing, so the Issue remains
  open.
- Issue #667: PR #668 merged the post-approve reviewer marker wait gate, but
  live/mapped E2E close-readiness evidence is still missing, so the Issue remains
  open.
- Issue #495 / Issue #595: repo-backed `vtdd-chief-butler` Skill can remove the
  immediate mac-local-only traffic-control document gap, but Dashboard Butler
  runtime discovery, Custom GPT exposure, VPS Codex CLI inventory, and mapped
  E2E remain incomplete until follow-up implementation proves those surfaces can
  read and apply the same Skill.
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
- Issue #579: PR #686, production draft-retention evidence, production
  same-thread response evidence, and owner live evidence satisfy substantial
  text input / recovery evidence. It remains an evidence gap for final
  iPhone/PWA lock/suspend recovery unless the owner explicitly narrows or accepts
  that column. Attachment candidate/reselect UX belongs to Issue #498 / Issue
  #587 and should not keep #579 open by itself.
- Issue #654: PR #685 removed the old blocked reply from normal Dashboard chat,
  and PR #690 added a Durable Object pending-drain slice, but the HTTP persistence
  route still was not a live conversation path. Issue #654 remains incomplete
  until WebSocket reconnect/resend is verified with owner-facing Dashboard Butler
  evidence.
- Issue #657: chief-butler interpretation confirmation is a process / traffic
  control gap and remains open until the protocol is repo/runtime-backed with
  mapped evidence.
- Issue #613: PR #792 merged runtime thread normalization for single main chat,
  but production PWA evidence, repo context ambiguity handling, voice-ready
  operation lane, and VPS/env cleanup remain incomplete.
- Issue #723: manual freshness / force cache reload controls exist, but close
  readiness still needs evidence posting and stale-client recovery judgment. The
  automatic deploy-notification-driven refresh follow-up is Issue #793.
- Issue #741: deploy後 bridge checkout sync / restart lifecycle has
  implementation slices, but production evidence and authority-bound cleanup
  remain incomplete.

## Blocked

- Any deploy, credential mutation, permission mutation, repository administration,
  destructive cleanup, merge, post-merge Issue close, or merged-branch deletion
  remains blocked on the authority boundary in AGENTS.md.
- Any owner action required by the assistant must be sent through PWA
  notification when the runtime has a connected notification path. If that path
  is unavailable, report `pwa_notification_unavailable` and preserve the
  recovery/action link in Dashboard notifications and GitHub-visible runtime
  truth; do not rely on chat alone as the intended VTDD product path.
- Production iPhone/PWA live evidence remains blocked unless the relevant PR
  scope explicitly authorizes live verification.
- Production deploy and app-server bridge restart after PR #791 / PR #792 remain
  blocked on scoped passkey approval. Do not claim those merged PRs are
  production-complete from local tests or GitHub merge truth alone.
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
- Issue #634: iPhone input auto-zoom must be fixed without disturbing the normal
  Dashboard chat surface.
- Issue #670: Cloudflare / fixed-cost monitoring should become Butler-readable
  ops truth without dominating normal chat.
- Issue #689: LINE-like reply target preview / tap-to-scroll context for
  fast multi-message Dashboard Butler chat. This is required owner-facing UX, but
  it remains `QUEUE` and must not preempt the current Now item.
- Issue #698: notification policy and delayed notification settings should move
  onto the shared notification system.
- Issue #703: pre-development strategy guard. The 開発前作戦図 gate is active as a
  process guardrail; remaining automation/guard enforcement stays queued unless
  it becomes a root blocker.
- Issue #716: Butler thought buffer and repo-specific execution lanes for
  capturing ideas without replacing the current `Now`.
- Issue #717: immediate VPS runner wakeup after queue comment, with the one
  minute timer as fallback.
- Issue #722: Dashboard Butler completion events should append thread state and
  drive next action.
- Issue #723: stale PWA/client self-refresh and manual force reload remains an
  evidence gap / support slice for Issue #590.
- Issue #741: app-server bridge lifecycle guard for main and repo-less chat.
- Issue #744: Dashboard chat long replies must remain readable and avoid tail
  clipping.
- Issue #745: reviewer fallback must not keep calling a ChatGPT-account
  unsupported model.
- Issue #748: cost-aware presence / voice / progress redesign. Treat as a root
  design constraint for Issue #590 / Issue #613 work, but do not let it become a
  broad implementation detour without a bounded slice.
- Issue #793: deploy notification driven stale-client refresh. This is the
  agreed follow-up to Issue #723: deploy notifications should trigger stale
  client detection and conditional auto/one-tap refresh without writing chat
  spam or losing draft/thread/pending turn state.

## Questions

- Issue #595: remains open because the runtime auto-classification path for
  Butler / VPS Codex CLI is not connected yet. This PR only refreshes the
  durable queue snapshot and intentionally preserves the active Now/Next order
  instead of letting #689 or evidence-only close-readiness work replace it.
- Decide in a future bounded slice whether `docs/mvp/active-issue-execution-queue.md`
  should be generated from GitHub runtime truth or remain hand-curated with tests.

## Discovered

- Issue #793 was discovered from owner discussion and authored on 2026-06-05. It
  is now classified as `QUEUE`, not as an untracked discovery.

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
