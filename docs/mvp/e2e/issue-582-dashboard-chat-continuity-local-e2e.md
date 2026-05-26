# Issue #582 Dashboard Chat Continuity Local E2E

## Scope

- Issue: #582
- Related Issue: #579
- Surface: Dashboard Butler chat
- Runtime: local worker-backed dashboard page opened in iOS Simulator Safari
- Device: iPhone 17 Pro simulator, iOS 26.5

## Scenario

1. Start a local HTTP harness that serves the real dashboard HTML from `src/worker.js`.
2. Open `/dashboard?repository=marushu%2Fvtdd-v2-p` in iOS Simulator Safari.
3. Let the harness drive 10 consecutive owner messages through the dashboard composer.
4. Confirm the worker-backed dashboard chat route stores 10 owner messages.
5. Capture the iOS Simulator screen after the run.

## Result

- Owner messages stored: 10
- Stored owner message IDs keep the dashboard client-message-id prefix (`dashboard_owner_message:`), so thread truth can unlock a pending owner send when an ACK is missing.
- The composer was not left locked after the 10th message.
- The screenshot shows the 10th owner message and the composer still available.
- The local WebSocket intentionally had no upgrade server, so the UI shows the recovery status. This verifies the HTTP fallback path, not a live app-server WebSocket path.

## Evidence

- Screenshot: `docs/mvp/e2e/assets/issue-582/local/ios-simulator-dashboard-chat-10-turns.png`
- State JSON: `docs/mvp/e2e/assets/issue-582/local/ios-simulator-dashboard-chat-10-turns-state.json`

## Remaining Gap

- This is iOS Simulator Safari local E2E, not production iPhone PWA live E2E.
- Production deploy and live iPhone/PWA evidence are still required before claiming Issue #582 fully complete.
