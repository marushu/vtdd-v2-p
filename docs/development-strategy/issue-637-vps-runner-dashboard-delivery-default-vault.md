# Issue #637 VPS runner Dashboard delivery default vault strategy

- Target Issue: Issue #637
- Queue position: Now
- Completion slice: VPS runner privileged maintenance completion events must return to Dashboard Butler when the runner service does not have `VTDD_RUNTIME_URL` in its environment but the VPS has the standard gateway bearer vault.
- Owner-facing success: after iPhone passkey approval and VPS helper execution, Dashboard Butler can observe the helper result in the target dashboard thread instead of leaving only GitHub comments with `dashboardDelivery: skipped`.
- Root blocker: previous live evidence showed helper execution completed, but Dashboard delivery was skipped because `VTDD_RUNTIME_URL` or `VTDD_GATEWAY_BEARER_TOKEN` was missing from the runner service environment.
- Hypothesis: `scripts/run-vps-runner.mjs` already reads the gateway bearer token from the default vault manifest through `loadGatewayBearerTokenFromVault`, but runtime URL lookup only used an explicit manifest path. If service env is empty, token lookup succeeds from `~/.vtdd/credentials/manifest.json` while runtime URL lookup returns empty.
- File/line estimate: `scripts/run-vps-runner.mjs` around `resolveVpsRunnerDashboardDeliveryConfig` and `loadVpsRunnerRuntimeUrlFromVaultManifest`; `test/vps-runner-script.test.js` around Dashboard delivery vault tests.
- Planned implementation: make runtime URL lookup use the same default vault manifest path as bearer-token lookup, while preserving existing manifest fallback keys (`gateway.runtimeUrl`, `runtime.url`, `runtime.runtimeUrl`, `dashboard.runtimeUrl`).
- Validation plan: run targeted `node --test test/vps-runner-script.test.js`; verify the new test covers empty service env plus default vault manifest. No Worker build is required because Worker runtime is not changed.
- Non-goals: root/helper execution, credential mutation, deploy, Issue closure, Dashboard UI changes, #703 strategy UI, and unrelated runner refactors.
- Expected risk: if the VPS vault manifest lacks `gateway.runtimeUrl`, this slice still reports skipped. That is a runtime configuration gap, not a reason to guess a production URL in code.
- Stop condition: if validation requires reading or mutating real VPS credentials, stop and report a passkey/config boundary instead of executing.
