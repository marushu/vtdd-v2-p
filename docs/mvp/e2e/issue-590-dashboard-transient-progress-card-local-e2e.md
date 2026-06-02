# Issue #590: Dashboard inline transient progress local mobile E2E

Date: 2026-06-02

Command:

```bash
npx playwright test scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs --browser=chromium --reporter=line
```

Result:

- pass: `Dashboard Butler shows app-server timeout as recoverable and keeps composer usable`
- pass: `Dashboard Butler inline transient progress stays visible on mobile without adding chat bubbles`

Inline transient progress evidence:

- viewport: `390x844`
- `paneLeft`: `10`
- `paneRight`: `380`
- `viewportWidth`: `390`
- `paneWidth`: `370`
- `logWidth`: `370`
- `logScrollWidth`: `370`
- `logClientWidth`: `370`
- `textScrollWidth`: `338`
- `textClientWidth`: `338`
- `bubbleCount`: `3`
- `transientCount`: `1`

Evidence files:

- `docs/mvp/e2e/assets/issue-590/local/issue590-dashboard-inline-transient-progress-chromium-state.json`
- `docs/mvp/e2e/assets/issue-590/local/issue590-dashboard-inline-transient-progress-chromium-390x844.png`

Interpretation:

- The inline transient progress pane stays inside the mobile viewport above the composer.
- The progress text wraps without horizontal overflow.
- The pane does not append durable chat bubbles.

Boundary:

- This is local Chromium mobile-viewport evidence, not production iPhone/iPad PWA evidence.
- Production Dashboard Butler PWA slow-turn E2E remains required after merge and deploy.
