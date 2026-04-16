# vtdd-v2
VTDD V2: memory-first architecture with pluggable sockets and GitHub-first but non-lock-in design

## MVP Core (initial implementation)

Current code starts with deterministic governance gates:

- constitution-first execution check
- runtime truth precondition with stale detection and reconcile-required conflict detection
- approval boundary (`GO` / `GO + passkey`)
- PR action split boundary (`pr_comment` without GO, `pr_review_submit` with GO)
- consent + approval schema checks (category grant, approval phrase, scope binding)
- structured issue traceability checks (intent/success/non-goal refs + out-of-scope guard)
- role-action boundary (`butler` / `executor` / `reviewer`)
- constitution schema validator with required core rule coverage checks
- credential boundary (`github_app` + tiered permissions + short-lived high-risk credential)
- alias-based repository resolution with no default repository
- memory safety gate (record-type boundary + secret exclusion + redaction helper)
- canonical memory safety policy for store/do-not-store and Git-vs-DB separation
- decision/proposal log contracts and in-memory store primitives
- memory schema + provider interface + retrieve primitives
- retrieval contract (phase-aware source priority and primary reference selection)
- reviewer pluggable contract (Gemini initial + registry-based adapter model)
- canonical reviewer policy (Gemini initial, Antigravity emergency fallback, no execution authority)
- canonical role separation model for Butler / Executor / Reviewer handoff and isolation
- Cloudflare provider minimum adapter (D1/R2/Vectorize via injected clients)
- Cloudflare Worker runtime entry (`src/worker.js`) with `/health`, `/setup/wizard`, `/v2/gateway`, and `/v2/retrieve/*` routes (legacy `/mvp/*` aliases also accepted)
- production deploy workflow (`.github/workflows/deploy-production.yml`) for `GitHub Actions -> Cloudflare`
- execution policy gate (traceability + target resolution + approval)
- Butler orchestrator (surface independence + fixed judgment order + policy integration)
- canonical Butler review protocol with constitution-first judgment order
- MVP gateway (`runMvpGateway`) that composes policy, workflow, retrieval, and memory safety
- setup wizard contract (`runInitialSetupWizard`) with explicit output targets and iPhone-first onboarding pack
- machine auth path for `/v2/gateway` + `/v2/retrieve/*` (Bearer token / Access service token)
- immutable workflow state machine (`Idea -> Proposal -> Issue -> GO -> Build -> PR -> Review -> Merge`)
- reconcile hold state (`reconcile_required`) for runtime/memory conflicts
- guarded semi-automation mode (`normal` / `guarded_absence`) with ambiguity-stop boundaries and execution-log traceability

Code lives in `src/core/`, with tests in `test/`.
Worker entry lives in `src/worker.js`.

## Run tests

```bash
npm test
```
