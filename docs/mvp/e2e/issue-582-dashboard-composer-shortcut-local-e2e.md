# Issue #582 Dashboard Composer Shortcut Local E2E

## Scope

- Issue: #582
- PR: #591
- Surface: Dashboard Butler chat composer
- Runtime: local worker-backed dashboard page served from `src/worker.js`
- Scenario: external-keyboard style composer shortcuts
- Reproducible harness: `scripts/e2e-dashboard-composer-shortcut.spec.mjs`

## Scenario

1. Start a local HTTP harness that serves the real dashboard HTML with authenticated owner headers.
2. Open `/dashboard?repository=marushu%2Fvtdd-v2-p`.
3. Focus `#butler-message`.
4. Verify `Shift+Enter` remains a textarea newline.
5. Verify modified Enter submits through the existing form submit path.
6. Confirm the owner message bubble renders after submit and the composer clears.

## Result

- Google Chrome channel on macOS passed.
- Playwright WebKit 26.4 passed with Safari-compatible user agent.
- `Shift+Enter` kept `line one\nline two` in the textarea.
- `Command+Enter` submitted `command enter send` and rendered an owner bubble.
- `Control+Enter` submitted `control enter send` and rendered an owner bubble.
- The composer value was empty after each submitted owner message.

## Evidence

- Chrome state: `docs/mvp/e2e/assets/issue-582/local/dashboard-composer-shortcut-chromium-state.json`
- Chrome screenshot: `docs/mvp/e2e/assets/issue-582/local/dashboard-composer-shortcut-chromium.png`
- WebKit state: `docs/mvp/e2e/assets/issue-582/local/dashboard-composer-shortcut-webkit-state.json`
- WebKit screenshot: `docs/mvp/e2e/assets/issue-582/local/dashboard-composer-shortcut-webkit.png`

## Commands

- `npm run e2e:dashboard-composer-shortcut:chrome`
- `npm run e2e:dashboard-composer-shortcut:webkit`

## Remaining Gap

- macOS Safari WebDriver could not create a session because Safari remote automation is disabled in local Safari settings.
- This run is local browser E2E, not production iPhone/iPad PWA live E2E.
- It reduces the Safari/WebKit compatibility risk for #591, but does not claim full Issue #582 Butler Completion Gate completion.
