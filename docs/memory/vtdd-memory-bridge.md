# VTDD Memory Bridge

Issue #251 requires shared operational memory to be usable from more than one
agent surface. The bridge in `scripts/vtdd-memory.mjs` is the operator-facing
entry point for checking and writing VTDD memory from Mac Codex, VPS Codex CLI,
and Butler-adjacent workflows without hard-coding the owner's Cloudflare
resources.

## Intent

The bridge makes shared RAG a verifiable harness before expanding the VPS
command plane. It does not replace GitHub truth, AGENTS.md, runtime truth, or
approval boundaries.

The target operating model is:

- Mac Codex can inspect and seed structured memory through Wrangler-backed D1.
- VPS Codex CLI can retrieve shared memory through the runtime route with
  machine auth instead of needing Cloudflare admin credentials.
- Butler can use the same canonical memory records through existing retrieve
  actions.

## Required Configuration

Use environment variables or equivalent command flags:

- `VTDD_MEMORY_D1_DATABASE_NAME`: Cloudflare D1 database name for direct
  Wrangler operations. If this is absent, the CLI also accepts
  `CLOUDFLARE_D1_DATABASE_NAME` so local repair commands can use the same
  operator-owned name as GitHub Actions.
- `VTDD_RUNTIME_URL`: Worker runtime base URL for retrieve operations.
- `VTDD_GATEWAY_BEARER_TOKEN`: machine-auth token for runtime retrieve/write
  operations.
- `~/.vtdd/credentials/manifest.json`: optional desktop/VPS bootstrap vault
  fallback. When `VTDD_GATEWAY_BEARER_TOKEN` is absent, the CLI may read
  `gateway.bearerTokenPath` from this manifest and use that file's contents as
  the runtime bearer token.

Do not commit runtime URLs, database IDs, bearer tokens, account IDs, or owner
specific bootstrap values into this repository.
Direct `wrangler d1 execute` uses a database name or binding, not the
Cloudflare `database_id` secret. Keep the relationship explicit:

- runtime Worker binding name: `VTDD_MEMORY_D1`
- GitHub Actions D1 database name variable: `CLOUDFLARE_D1_DATABASE_NAME`
- GitHub Actions D1 database id secret: `CLOUDFLARE_D1_DATABASE_ID`
- local direct-D1 name: `VTDD_MEMORY_D1_DATABASE_NAME` or
  `CLOUDFLARE_D1_DATABASE_NAME`

The database name and id must point at the same operator-owned Cloudflare D1
database. This repository must not pin the owner's production database name as
the public default.
Do not pass bearer tokens as command-line flags; use the environment variable
so the token is less likely to land in shell history or process logs.
If neither the environment variable nor the bootstrap vault token path is
available, the runtime memory commands must fail with `desktop maintenance
required` instead of falling back to D1 direct writes or asking the operator to
paste a secret into chat.

Bootstrap the local gateway bearer token reference with:

```sh
printf '%s' "$VTDD_GATEWAY_BEARER_TOKEN" | node scripts/bootstrap-gateway-bearer-vault.mjs \
  --token-stdin \
  --pretty
```

This creates/updates `~/.vtdd/credentials/manifest.json` and
`~/.vtdd/credentials/gateway/bearer-token.txt` without printing the token value.
It only configures the local Mac/VPS caller. It does not rotate or sync Worker
secrets, GitHub Actions secrets, or Custom GPT Action auth.

If the gateway bearer token is rotated, the same value must be aligned across:

- the local Mac/VPS vault token file,
- GitHub Actions secret `VTDD_GATEWAY_BEARER_TOKEN`,
- the deployed Worker secret `VTDD_GATEWAY_BEARER_TOKEN`,
- Custom GPT Action bearer auth.

The operator page can sync the GitHub Actions secret under
`highRiskKind=github_actions_secret_sync`, but Worker secret rotation and Custom
GPT Action auth update remain separate explicit credential-update steps.

## Commands

Inventory D1 memory records:

```sh
node scripts/vtdd-memory.mjs inventory \
  --database "$VTDD_MEMORY_D1_DATABASE_NAME" \
  --pretty true
```

Retrieve canonical cross memory through the Worker runtime:

```sh
node scripts/vtdd-memory.mjs retrieve-cross \
  --transport runtime \
  --runtime-url "$VTDD_RUNTIME_URL" \
  --related-issue 251 \
  --text "shared rag harness mac codex vps codex butler memory bridge" \
  --pretty true
```

Write a RAG checkpoint through the Worker runtime:

```sh
node scripts/vtdd-memory.mjs write-runtime-checkpoint \
  --runtime-url "$VTDD_RUNTIME_URL" \
  --confirmed true \
  --owner-consent "GO" \
  --repository "owner/repo" \
  --related-issue 361 \
  --summary "Compact checkpoint summary." \
  --checkpoint-reason "Context compression risk before implementation." \
  --thought-location "Owner and Codex discussion before touching code." \
  --user-tension "Concerned that compressed context may create partial RAG." \
  --origin-surface "mac_codex" \
  --origin-moment "Issue #343 implementation start" \
  --origin-trigger "Owner moved the next slice from Issue #344 to Issue #343." \
  --user-word "それでいこう" \
  --tension-summary "Owner accepted the #344/#343 boundary and wants recall hooks." \
  --tension-intensity "medium" \
  --tension-mode "steady" \
  --tension-why-it-matters "Future Butler recall should recover why #343 became next." \
  --context-source-quality "full_thread_context" \
  --hypothesis "Checkpoint schema should ride existing working_memory." \
  --exploration-hypothesis-json '{"summary":"Checkpoint schema should ride existing working_memory.","whySuspected":"Existing runtime already writes working_memory checkpoints.","status":"open","suspectedFiles":["docs/memory-schema.md","scripts/vtdd-memory.mjs"],"suspectedLines":[{"file":"scripts/vtdd-memory.mjs","lineStart":207,"lineEnd":235,"reason":"Runtime checkpoint payload is assembled here."}]}' \
  --rejected-hypotheses-json '[{"summary":"Use decision_log for checkpoint saves.","whyRejected":"Checkpoints can be tentative and should not be promoted to decided rationale.","evidence":"docs/butler/thread-independent-startup-contract.md"}]' \
  --stop-reason-json '{"summary":"Stop if Butler Action Schema and runtime payload diverge.","authorityBoundary":"owner_decision_required"}' \
  --uncertainty-json '{"summary":"Unknown whether generated OpenAPI docs need parity updates.","unknowns":["yaml/json schema parity","runtime route payload"],"nextCheck":"Run setup docs tests."}' \
  --failure-reasoning-json '{"whatFailed":"Prior actors could not reconstruct why a hypothesis was abandoned.","whyFailed":"Rejected hypotheses were not persisted.","inspectNextTime":"Retrieve failureMap before retrying."}' \
  --success-pattern-json '{"whatWorked":"Saving suspected files before implementation made PR review traceable.","whyWorked":"The next actor could compare hypotheses with the actual diff.","reuseConditions":["Issue-backed implementation","bounded file set"]}' \
  --expected-file "docs/memory-schema.md" \
  --expected-file "scripts/vtdd-memory.mjs" \
  --tag "issue:361" \
  --pretty true
```

Confirm a RAG checkpoint through the same Worker runtime operational-memory
surface:

```sh
node scripts/vtdd-memory.mjs retrieve-operational \
  --runtime-url "$VTDD_RUNTIME_URL" \
  --repository "owner/repo" \
  --text "Compact checkpoint summary or tags." \
  --limit 5 \
  --pretty true
```

Operational-memory natural-language recall is deterministic bounded retrieval,
not a guarantee that vector/semantic search is active. The response exposes:

- `retrievalSignals.queryCandidateRetrieval`: whether the runtime expanded the
  query into bounded token / tag / `issue:<number>` candidate retrieval.
- `compactContext[].retrievalMatch`: why each record matched, including query
  tokens, matched tags, related Issue, repository, and record type.
- `retrievalSignals.semanticRetrieval.enabled`: currently `false` unless a
  separate semantic/vector provider is wired.

For owner-facing memory confirmation, prefer a two-step proof:

1. retrieve by `recordId` immediately after write;
2. retrieve again by natural text, tags, or `relatedIssue` and verify the same
   record appears near the top with visible `retrievalMatch` evidence.

If direct D1 inventory is unavailable because local Wrangler auth expired, use
the runtime route above with the local gateway bearer vault. Do not fall back
to pasting Cloudflare credentials into chat or starting the Codex app-server
bridge just to verify memory save/search.

Recover a known `working_memory` checkpoint that was saved while repository was
unresolved:

```sh
node scripts/vtdd-memory.mjs retrieve-operational \
  --runtime-url "$VTDD_RUNTIME_URL" \
  --record-id "working_memory_<issue>_<timestamp>_<slug>" \
  --limit 1 \
  --pretty true
```

If a repository is also supplied, an explicit `recordId` lookup may return a
repo-null record as recovery evidence. Treat that as explicit record recovery,
not proof that the record matched the repository-scoped search.

Mac Codex and VPS Codex CLI should use the same runtime write/retrieve contract
for normal RAG checkpoint handling. Direct Wrangler/D1 writes remain an
operator repair tool, not the default path for shared memory continuity.

Retrieve canonical cross memory directly from D1:

```sh
node scripts/vtdd-memory.mjs retrieve-cross \
  --transport d1 \
  --database "$VTDD_MEMORY_D1_DATABASE_NAME" \
  --related-issue 251 \
  --limit 5 \
  --pretty true
```

Write a canonical decision record:

```sh
node scripts/vtdd-memory.mjs write-decision \
  --database "$VTDD_MEMORY_D1_DATABASE_NAME" \
  --id "decision_251_YYYYMMDD_short_name" \
  --related-issue 251 \
  --decision "Decision text." \
  --rationale "Why this decision exists." \
  --decided-by "owner_and_codex" \
  --repository "owner/repo" \
  --tag "shared-rag" \
  --pretty true
```

Write a canonical proposal record:

```sh
node scripts/vtdd-memory.mjs write-proposal \
  --database "$VTDD_MEMORY_D1_DATABASE_NAME" \
  --id "proposal_251_YYYYMMDD_short_name" \
  --related-issue 251 \
  --hypothesis "Proposal hypothesis." \
  --option "Option A" \
  --option "Option B" \
  --proposed-by "owner_and_codex" \
  --repository "owner/repo" \
  --pretty true
```

Write a non-canonical memory record when a specific type is required:

```sh
node scripts/vtdd-memory.mjs write-record \
  --database "$VTDD_MEMORY_D1_DATABASE_NAME" \
  --id "working_251_YYYYMMDD_short_name" \
  --type "working_memory" \
  --content-json '{"summary":"Compact operational summary."}' \
  --metadata-json '{"relatedIssue":251,"repository":"owner/repo"}' \
  --tag "issue:251" \
  --pretty true
```

## Safety Rules

- Do not store full conversation transcripts by default.
- Do not store raw hidden chain-of-thought. Store compact judgment logs:
  observations, reasons, hypotheses, tensions, evidence, and next return points.
- Store rejected hypotheses when they explain why a branch, workaround, or file
  path was abandoned; "外した仮説" is part of reconstruction evidence.
- Use structured `explorationHypothesis`, `suspectedFiles`, `suspectedLines`,
  `stopReason`, `uncertainty`, `failureReasoning`, and `successPattern` fields
  when the checkpoint is meant to survive Butler / VPS Codex CLI / mac Codex
  handoff.
- Do not store secrets, raw tokens, private keys, or owner-only credentials.
- Do not treat memory as permission to deploy, merge, close issues, mutate
  credentials, or run destructive operations.
- Use decision/proposal helpers when the record must be retrievable through
  cross-memory by `relatedIssue`.
- Use runtime checkpoint writes from Mac Codex and VPS Codex CLI when the goal is
  shared Butler-visible memory rather than direct Cloudflare administration.
- Treat empty retrieval as an operational finding, not as proof that no
  relevant history exists.

## Current Boundary

This bridge is a CLI and documentation slice. It does not add a new Custom GPT
Action, does not change the Worker runtime, and does not deploy Cloudflare.
Future integration work may connect this bridge to VPS runner preflight and
Butler instructions, but that requires a separate bounded Issue contract.
