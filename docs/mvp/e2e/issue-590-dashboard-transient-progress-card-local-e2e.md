# Issue #590: Dashboard transient progress card local mobile E2E

Date: 2026-06-02

Command:

```bash
npx playwright test scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs --browser=chromium --reporter=line
```

Result:

- pass: `Dashboard Butler shows app-server timeout as recoverable and keeps composer usable`
- pass: `Dashboard Butler transient progress card stays visible on mobile without adding chat bubbles`

Transient progress card evidence:

- viewport: `390x844`
- `cardLeft`: `14`
- `cardRight`: `320.234375`
- `viewportWidth`: `390`
- `cardWidth`: `306.234375`
- `logWidth`: `370`
- `logScrollWidth`: `370`
- `logClientWidth`: `370`
- `textScrollWidth`: `280`
- `textClientWidth`: `280`
- `bubbleCount`: `3`
- `transientCount`: `1`

Evidence files:

- `docs/mvp/e2e/assets/issue-590/local/issue590-dashboard-transient-progress-card-chromium-state.json`
- `docs/mvp/e2e/assets/issue-590/local/issue590-dashboard-transient-progress-card-chromium-390x844.png`

Interpretation:

- The transient progress card stays inside the mobile viewport.
- The progress text wraps without horizontal overflow.
- The card does not append durable chat bubbles.

Boundary:

- This is local Chromium mobile-viewport evidence, not production iPhone/iPad PWA evidence.
- Production Dashboard Butler PWA slow-turn E2E remains required after merge and deploy.
