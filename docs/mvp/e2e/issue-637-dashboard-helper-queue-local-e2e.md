# Issue #637 Dashboard Helper Queue Local E2E

## Scope

Issue #637 の Dashboard Butler 面で、VPS privileged maintenance intent を自然文として受け、同一 origin の runtime route から helper execution queue まで到達できることを確認した。

この E2E は root-owned helper を実行しない。GitHub queue comment 投稿も `GITHUB_API_FETCH` をモックし、VPS runner pickup と root / sudo 実行は発生させない。

## Runs

- Chromium mobile viewport 390 x 844
  - command: `PW_CHANNEL=chrome npx playwright test scripts/e2e-issue637-dashboard-helper-queue.spec.mjs --browser=chromium --reporter=line`
  - result: passed
  - state: `docs/mvp/e2e/assets/issue-637/local/issue637-dashboard-helper-queue-chromium-state.json`
  - screenshot: `docs/mvp/e2e/assets/issue-637/local/issue637-dashboard-helper-queue-chromium-390x844.png`
- WebKit mobile viewport 390 x 844
  - command: `npx playwright test scripts/e2e-issue637-dashboard-helper-queue.spec.mjs --browser=webkit --reporter=line`
  - result: passed
  - state: `docs/mvp/e2e/assets/issue-637/local/issue637-dashboard-helper-queue-webkit-state.json`
  - screenshot: `docs/mvp/e2e/assets/issue-637/local/issue637-dashboard-helper-queue-webkit-390x844.png`

## Observed Runtime Truth

- Dashboard Butler chat accepted the owner intent for Issue #637.
- Butler response explains the VPS privileged maintenance flow and passkey/root boundary instead of the stale app-server fallback.
- Proposal, helper request, helper execution handoff, and helper execution queue routes are reachable from the Dashboard origin.
- Queue runtime truth reports `queued_for_vps_helper_execution`.
- `rootExecutionStarted=false`.
- `helperExecutionStarted=false`.
- Queue comment body includes `vtdd:vps-privileged-maintenance-execution:issue637-dashboard-e2e`.

## Remaining Boundary

Issue #637 remains incomplete until a live passkey-approved VPS runner pickup invokes the root-owned helper and reports before/after runtime truth back to Dashboard Butler and GitHub-visible evidence.
