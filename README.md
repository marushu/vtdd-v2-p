# vtdd-v2
VTDD V2: memory-first architecture with pluggable sockets and GitHub-first but non-lock-in design

## MVP Core (initial implementation)

Current code starts with deterministic governance gates:

- constitution-first execution check
- runtime truth precondition with stale detection and reconcile-required conflict detection
- approval boundary (`GO` / `GO + passkey`)
- consent + approval schema checks (category grant, approval phrase, scope binding)
- role-action boundary (`butler` / `executor` / `reviewer`)
- credential boundary (`github_app` + tiered permissions + short-lived high-risk credential)
- alias-based repository resolution with no default repository
- memory safety gate (record-type boundary + secret exclusion + redaction helper)
- retrieval contract (phase-aware source priority and primary reference selection)
- execution policy gate (traceability + target resolution + approval)
- Butler orchestrator (surface independence + fixed judgment order + policy integration)
- MVP gateway (`runMvpGateway`) that composes policy, workflow, retrieval, and memory safety
- setup wizard contract (`runInitialSetupWizard`) with explicit output targets (Git for shared spec, DB for user state)
- immutable workflow state machine (`Idea -> Proposal -> Issue -> GO -> Build -> PR -> Review -> Merge`)
- reconcile hold state (`reconcile_required`) for runtime/memory conflicts

Code lives in `src/core/`, with tests in `test/`.

## Run tests

```bash
npm test
```
