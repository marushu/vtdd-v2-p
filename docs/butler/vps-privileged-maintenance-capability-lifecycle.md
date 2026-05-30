# VPS privileged maintenance capability lifecycle

Issue: #637

This document records the product boundary discovered during the PR #632
Playwright E2E blocker on 2026-05-29.

## Why This Exists

VTDD cannot require the owner to sit at a Mac, SSH into the VPS, and become
root whenever a missing host capability appears. That path is useful as
break-glass bootstrap, but it is not Butler-complete.

The target recovery path is:

`Owner on iPhone PWA -> Dashboard Butler -> scoped passkey approval -> VPS root-owned helper -> runtime truth`

The owner must be notified through PWA when an owner action is required. A chat
message alone is not enough for work that is blocked on owner attention.

## Required Shape

- Dashboard Butler understands the maintenance intent in natural language.
- The runtime explains the host, repository, capability, risk, impact scope,
  expiry, and expected before/after state before asking for approval.
- The owner approves the one scoped operation through same-origin passkey.
- The VPS executes only through a root-owned helper and root-owned capability
  manifest.
- `vtdd-runner` must not receive broad `NOPASSWD:ALL`.
- The helper returns redacted runtime truth: before state, command class, exit
  code, after state, log summary, next action, and blocker if any.
- Butler writes or links GitHub-visible evidence when the operation is part of
  Issue / PR recovery.
- PWA notification is sent for `approval_needed`, `execution_completed`, and
  `blocked_owner_action_required`.

## Capability Lifecycle

Capabilities must be manageable from iPhone after approval:

- propose: Butler creates a capability proposal with command class, allowed
  arguments, working directory, package/file impact, risk level, rollback or
  disable plan, and redaction rules.
- enable: scoped passkey approval enables a known capability.
- add: scoped passkey approval adds a new capability to the manifest.
- disable: scoped passkey approval turns off a capability without deleting its
  audit history.
- remove: scoped passkey approval removes an obsolete capability from the active
  manifest.
- rollback: scoped passkey approval restores the last known-good manifest when
  a new capability is unsafe.
- review: Butler reports active capabilities, disabled capabilities, last used
  time, owner approvals, and known risk.

The design must support reducing authority as easily as adding it.

The repository-backed core contract lives in
`src/core/vps-privileged-maintenance.js`. It is intentionally pure and does not
install a helper, mutate sudoers, or run root commands. It defines the manifest,
proposal, review, approval-scope, and add/enable/disable/remove/rollback
lifecycle semantics that the Worker route and root-owned VPS helper must use in
later implementation slices.

Each proposal must include:

- capability id and owner-facing title.
- command class, not an arbitrary root shell.
- allowed arguments or package/action set.
- allowed working directory or host path scope.
- affected paths or package classes.
- risk level.
- rollback or disable plan.
- log redaction rules.
- expected runtime truth.
- reason that explains why the owner is being asked to approve it.

The core contract rejects broad privileged patterns such as `NOPASSWD:ALL`,
`sudo su`, and root shell capabilities. If a break-glass capability is ever
needed, it must be designed as a separate high-risk Issue with stronger
approval, TTL, audit, and cleanup semantics.

The helper execution path must not treat manifest `allowedArgs` as arbitrary
root commands. Before a helper request can become executable, the capability
must bind to the repo-backed helper command registry in
`src/core/vps-privileged-maintenance.js`. The registry is the bridge between a
reviewed capability and the root-owned helper implementation: dry-run rejects
unknown `commandClass` values and rejects registered commands whose risk level
or allowed arguments do not match the registry. The registry must also carry an
argv-form command preview for the root-owned helper. Future execution must use
that argv boundary rather than passing manifest strings through a shell.
The dry-run runtime truth must expose the normalized execution boundary as
`executable + args + shell:false`. The root-owned helper is responsible for
resolving `executable` through a controlled PATH allowlist; the repository
contract must not bake an operator-specific Node/NVM path into public runtime
truth. `allowedArgs` is display-only review text and must not be used as the
helper execution input.

The helper script may expose a guarded `--execute` mode only after the same
registry binding succeeds. Execution must remain separate from the pure Worker
planning contract: the Worker may report `execute_ready`, but root command
execution belongs to the VPS root-owned helper path. The helper must block
before spawning when it is not running as root for a root-required capability,
must keep non-root run-as commands blocked until a run-as contract exists, must
use `shell:false`, and must return redacted runtime truth with before/after,
exit code, and next-action evidence. Adding such a script path is still not
Butler Completion Gate success until Dashboard Butler / Custom GPT Action Schema
and VPS runtime observation can reach it with E2E evidence.

## Initial Presets

The first preset set should cover the failure classes already observed:

- systemd user service status, enable, restart, daemon-reload, timer state, and
  redacted journal summary for the VPS runner and Dashboard app-server bridge.
- Playwright Chromium dependency installation for a repository workspace.
- Codex sandbox sysctl application and verification.
- runner drain, cancel, heartbeat, and pending queue status.
- repository worktree sync for scoped E2E verification.

Cloudflare deploy, GitHub secret mutation, repository administration, and
destructive cleanup are not initial presets. They remain separate high-risk
planes with their own scoped passkey contracts.

## Notification Boundary

Existing Dashboard Web Push support can send a server-side test notification to
the current saved device subscription. The Worker also exposes a
machine-authenticated owner action event route:

`POST /v2/events/owner-action-required`

That route stores an `owner_action_required` Dashboard event and attempts Web
Push delivery to saved PWA subscriptions. It is the runtime entry point for
notifying the owner when Butler, VPS Codex CLI, a helper proposal, or another
machine process needs owner attention.

The recovery link for this route must be a same-origin `/dashboard` URL. The
route must reject external URLs, protocol-relative URLs, and underspecified
requests that lack a stable action id or owner-facing title/summary.

The Dashboard app-server bridge must call this route when Codex app-server asks
for command, file-change, patch, or permission approval. The bridge still
declines the app-server request mechanically; the PWA notification is an owner
attention signal, not an execution grant.

When owner action is required, the runtime must attempt PWA notification and
report send result truth. If push delivery is unavailable, Butler must mark
`pwa_notification_unavailable` and still preserve the recovery link in
Dashboard notifications and GitHub-visible runtime truth.

This route is not permission to execute privileged work. It carries the
attention request and recovery link only. The privileged operation still needs
the scoped passkey approval and root-owned helper lifecycle described above.

## Completion Boundary

Mac SSH/root work performed on 2026-05-29 resolved the immediate PR #632 host
dependency blocker. It is classified as `mac_codex_only_probe` plus
`recovery_gap_found`, not as VTDD completion.

Issue #637 is complete only when the iPhone/PWA path can recover the same class
of blocker without requiring mac Codex or manual SSH as the normal path.
