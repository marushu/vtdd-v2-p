# Worker Secret Bootstrap Options

This document is the canonical secret bootstrap comparison for Issue #105.

## Goal

Reduce operator pain when configuring Cloudflare Worker secrets for VTDD V2 without creating unsafe secret intake paths.

The comparison must preserve:

- no secret paste into chat
- no secret paste into setup wizard answers
- iPhone-first operation as the default reading
- approval-bound handling for any future privileged bootstrap path
- private repo / solo operator viability

## Secrets in Scope

Examples of secrets that may need bootstrap:

- `GITHUB_APP_ID`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `VTDD_GATEWAY_BEARER_TOKEN`
- `CF_ACCESS_CLIENT_ID`
- `CF_ACCESS_CLIENT_SECRET`

Values are sensitive even when their names are shown in setup output.

## Candidate Comparison

### Option A: Cloudflare Dashboard secret entry on iPhone or browser

Flow:

1. operator opens Cloudflare Dashboard
2. operator enters Worker secrets directly in Cloudflare-managed secret UI
3. operator redeploys or restarts the Worker
4. operator verifies readiness with setup wizard diagnostics

Pros:

- preserves iPhone-first operation
- does not send secrets through chat or setup wizard
- does not require a new privileged VTDD write API
- works for private repo / solo operator use
- keeps Cloudflare as the only secret ingestion endpoint

Cons:

- manual and repetitive
- private key paste on iPhone can still be awkward
- no one-tap bootstrap yet

Reading:

This is the adopted baseline for now.

### Option B: Wrangler / CI-assisted secret provisioning

Flow:

1. operator stores secret values locally or in CI-managed secret storage
2. operator runs `wrangler secret put` or `wrangler secret bulk`
3. operator verifies readiness with setup wizard diagnostics

Pros:

- reduces repetition for Mac or CI-based workflows
- can batch multiple secret updates
- avoids teaching VTDD to ingest secrets directly

Cons:

- not iPhone-first by default
- increases dependence on a separate trusted workstation or CI path
- can encourage over-automation outside approval boundaries if used carelessly

Reading:

Allowed as an optional operator path, but not the canonical iPhone-first path.

### Option C: Brokered one-time bootstrap session behind approval boundary

Flow:

1. operator opens a dedicated admin bootstrap surface
2. operator passes strong approval checks such as `GO + passkey`
3. operator writes secrets once through a narrow, audited, short-lived path
4. bootstrap path expires immediately after use

Pros:

- could reduce manual repetition substantially
- could remain iPhone-friendly if carefully designed
- could preserve least-privilege better than a generic secret write API

Cons:

- high implementation risk
- easy to get wrong and create a dangerous secret ingestion channel
- requires a full threat model, auditability plan, and revocation story

Reading:

Deferred. This is the most promising future automation path, but it is not safe to implement without its own bounded design and approval review.

That bounded design is now tracked by Issue #210.

## Rejected Paths

The following are out of bounds for normal operation:

- adding generic or unauthenticated secret input fields to setup wizard
- asking the user to paste secrets into chat
- generic secret write API without narrow approval and audit controls
- storing private keys or bearer tokens in Git, DB memory, Issue text, or PR text

## Evaluation Axes

Each candidate must be judged against all of the following:

- secret never flows through chat or the default setup wizard read path
- iPhone-first is preserved or degraded explicitly
- `GO + passkey` and related approval boundaries remain coherent
- Cloudflare / GitHub privilege surface does not expand unnecessarily
- private repo / solo operator use remains realistic
- diagnostics can confirm success without revealing secret values

## Adopted Current Reading

As of 2026-04-17:

- adopted now: Option A
- allowed optional operator path: Option B
- deferred for future bounded design: Option C

This means VTDD V2 currently prefers:

- Cloudflare Dashboard secret entry as the canonical bootstrap path
- setup wizard diagnostics as the confirmation path
- no generic direct secret ingestion by VTDD surfaces

Issue #181 introduces a bounded exception to evaluate separately:

- passcode-authenticated setup wizard may expose a narrow bootstrap step
- the step must stay allowlisted to `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, and `GITHUB_APP_PRIVATE_KEY`
- the step must not become a generic secret write surface

## Non-goals

- implementing a secret write API in this Issue
- making the default setup wizard read path receive private key or bearer token values
- replacing Cloudflare as the system of record for Worker secret storage
