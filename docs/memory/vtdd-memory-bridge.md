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
  Wrangler operations.
- `VTDD_RUNTIME_URL`: Worker runtime base URL for retrieve operations.
- `VTDD_GATEWAY_BEARER_TOKEN`: machine-auth token for runtime retrieve/write
  operations.
- `~/.vtdd/credentials/manifest.json`: optional desktop/VPS bootstrap vault
  fallback. When `VTDD_GATEWAY_BEARER_TOKEN` is absent, the CLI may read
  `gateway.bearerTokenPath` from this manifest and use that file's contents as
  the runtime bearer token.

Do not commit runtime URLs, database IDs, bearer tokens, account IDs, or owner
specific bootstrap values into this repository.
Do not pass bearer tokens as command-line flags; use the environment variable
so the token is less likely to land in shell history or process logs.
If neither the environment variable nor the bootstrap vault token path is
available, the runtime memory commands must fail with `desktop maintenance
required` instead of falling back to D1 direct writes or asking the operator to
paste a secret into chat.

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
  --context-source-quality "full_thread_context" \
  --hypothesis "Checkpoint schema should ride existing working_memory." \
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
