# vtdd-v2
VTDD V2: memory-first architecture with pluggable sockets and GitHub-first but non-lock-in design

## Repository Use Model

This repository is the public canonical VTDD V2 core maintained by
[`@marushu`](https://github.com/marushu).

It is public so other people can study it, fork it, and run it.
It is not a shared hosted runtime.

If you want to use VTDD yourself, the expected path is:

- fork this repository, or clone it into your own repository/account
- configure your own GitHub, Cloudflare, OpenAI, Gemini, and ChatGPT assets
- create and operate your own Butler / Custom GPT surface

The canonical repository remains owner-maintained.
User operation should happen in user-owned forks, repositories, and service
accounts.

## Ownership Boundary

This repository does not expect users to share the owner's secrets, GitHub App,
Cloudflare account, Gemini key, or ChatGPT surface.

Instead:

- workflow and runtime code reference secret names only
- each user is expected to set secrets in their own GitHub/Cloudflare/runtime
  environment
- each user is expected to connect their own Butler / Custom GPT to their own
  VTDD deployment

No setup wizard is assumed on this branch.
VTDD runtime is expected to run in a setup-complete environment owned by the
person using it.

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
- Cloudflare Worker runtime entry (`src/worker.js`) with `/health`, `/v2/gateway`, and `/v2/retrieve/*` routes (legacy `/mvp/*` aliases also accepted)
- production deploy workflow (`.github/workflows/deploy-production.yml`) for `GitHub Actions -> Cloudflare`
- execution policy gate (traceability + target resolution + approval)
- Butler orchestrator (surface independence + fixed judgment order + policy integration)
- canonical Butler review protocol with constitution-first judgment order
- MVP gateway (`runMvpGateway`) that composes policy, workflow, retrieval, and memory safety
- machine auth path for `/v2/gateway` + `/v2/retrieve/*` (Bearer token / Access service token)
- immutable workflow state machine (`Idea -> Proposal -> Issue -> GO -> Build -> PR -> Review -> Merge`)
- reconcile hold state (`reconcile_required`) for runtime/memory conflicts
- guarded semi-automation mode (`normal` / `guarded_absence`) with ambiguity-stop boundaries and execution-log traceability

Live end-to-end completion still requires explicit PR/review/runtime evidence.

Code lives in `src/core/`, with tests in `test/`.
Worker entry lives in `src/worker.js`.

## Mainline Direction

`main` is the VTDD core line.

- VTDD core philosophy, governance, gateway, retrieval, and provider contracts stay on `main`
- the historical hosted setup-wizard line is archived on `wizard-ready`
- `main` should no longer be read as the current setup-wizard product line

If you need the historical wizard research, read the `wizard-ready` branch and
the archive note there.

## Run tests

```bash
npm test
```
