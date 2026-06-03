# VTDD cost audit 2026-06-03

Related Issues: #748, #455, #745, #613

## Purpose

Capture the cost and quota lessons from the 2026-06-02 Dashboard Butler incident before app-server bridge work resumes. This is an audit note, not completion evidence.

## Immediate Root Cause

`DashboardChatRoom` accepted high-frequency app-server bridge events and rewrote the same Durable Object storage mapping every time `codexThreadId` appeared. App-server delta, status, progress, plan, diff, command, tool, and reasoning notifications can all carry the same `codexThreadId`, so `ctx.storage.put()` was coupled to transient presence.

The fix in this slice makes the `app_server_thread:<threadId>` mapping write idempotent: if the stored `codexThreadId` already matches the incoming one, the Worker does not write again.

## Cost-Aware Runtime Rules

- Presence is ephemeral by default.
- Durable writes are for recovery facts: owner messages, final Butler replies, failures, timeouts, approvals, evidence, and changed thread mappings.
- Delta/status/progress bursts must not write Durable Object storage, D1, R2, GitHub comments, or Push notifications by default.
- A repeated runtime fact with the same key and value must be a no-op unless a version, status, or recovery boundary changed.
- Any path that starts Codex CLI, Gemini, a reviewer, deploy, push, or notification delivery must have an owner-facing reason and a non-retryable failure marker.

## Audit Findings

| Area | Risk | Current evidence | Follow-up |
| --- | --- | --- | --- |
| DashboardChatRoom app-server mapping | High Cloudflare DO `rows_written` if same mapping is rewritten on every transient event | Fixed in this slice with a storage `put` count regression test | Keep as #748 completion evidence |
| App-server bridge `persistProgress: true` event mapping | Medium future D1/chat-store risk if generic progress is persisted broadly | Existing Worker tests keep generic progress transient-only; durable stages are narrow | Keep future progress persistence behind explicit stage allowlist |
| App-server bridge delta/status WebSocket flow | Medium latency/noise risk, low durable write risk after this fix | Deltas are not chat messages; now unchanged mapping is not rewritten | Consider client-side throttling/coalescing under #450/#613 |
| VPS Codex reviewer fallback | High Codex usage risk if unsupported model or auth failure repeats | Main already has `gpt-5.4-mini` default, `--model`, and blocked marker tests for unsupported model | #745 should verify live VPS config and actor identity so blocked comments can be posted once per head SHA |
| VPS runner timer | Medium GitHub/API and possible Codex usage risk if pending fallback requests never become terminal | Timer is active; bridge is inactive; prior logs showed repeated fallback completions / actor identity incidents | #455 should add queue throttle / non-retryable failure visibility |
| GitHub issue/PR comments as progress | Medium GitHub noise and runner reprocessing risk | Remote executor docs say progress-poll comments should be milestone-limited | Keep progress comments milestone-only: picked up, branch pushed, PR created/updated, blocked, completed |
| D1 chat/media/RAG stores | Medium cost/noise risk if full transcripts or raw media are stored | Repo rules already prohibit full transcript RAG by default; media docs use R2 for binary and D1 metadata | #415/#498 should keep pre-write filtering and metadata-only persistence |
| Push notifications | Medium notification fatigue and delivery cost/noise risk | Worker tests require owner-action and push auth boundaries | #514/#670 should rate-limit non-critical push and expose send-result truth |

## Bridge Restart Gate

Do not restart `vtdd-dashboard-app-server-bridge-unresolved.service` until all are true:

1. This fix is merged and deployed to the Worker that owns `DashboardChatRoom`.
2. Local tests include a passing storage write-count regression.
3. Cloudflare metrics baseline is captured before restart.
4. Bridge is restarted once, not enabled as `Restart=always` before the first smoke check.
5. One short Dashboard Butler turn is run and Cloudflare rowsWritten is checked again.
6. If rowsWritten bursts, stop and disable the bridge immediately.

## Verification Captured In This Slice

- `node --test test/worker.test.js`
- `node --test test/dashboard-app-server-bridge.test.js test/codex-review-fallback.test.js`
- `npm run build:worker`
- `npm run verify:worker`

## Non-Goals

- Do not remove Gemini or Codex fallback reviewer.
- Do not make Cloudflare paid plan the root fix.
- Do not start voice implementation before the presence/persistence boundary is proven.
- Do not restart or enable the production bridge before deploy and metrics evidence.
