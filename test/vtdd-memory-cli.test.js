import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildCheckpointPayload,
  buildCrossMemorySql,
  buildDecisionRecord,
  buildInsertRecordSql,
  buildInventorySql,
  buildProposalRecord,
  buildRuntimeCrossMemoryRequest,
  buildRuntimeMemoryWriteRequest,
  buildRuntimeOperationalMemoryRequest,
  parseArgs,
  withRuntimeMachineAuth
} from "../scripts/vtdd-memory.mjs";

test("parseArgs supports repeated option values", () => {
  const parsed = parseArgs([
    "write-proposal",
    "--option",
    "inventory",
    "--option",
    "runtime retrieve",
    "--related-issue",
    "251"
  ]);

  assert.equal(parsed.command, "write-proposal");
  assert.deepEqual(parsed.options.option, ["inventory", "runtime retrieve"]);
  assert.equal(parsed.options.relatedIssue, "251");
});

test("buildDecisionRecord creates canonical decision_log memory", () => {
  const record = buildDecisionRecord({
    id: "decision_251_test",
    relatedIssue: "251",
    decision: "Use shared RAG as the cross-agent harness.",
    rationale: "Mac Codex, VPS Codex CLI, and Butler need the same operational memory.",
    decidedBy: "owner_and_codex",
    repository: "marushu/vtdd-v2-p",
    timestamp: "2026-05-11T10:00:00.000Z",
    tag: "shared-rag"
  });

  assert.equal(record.type, "decision_log");
  assert.equal(record.content.relatedIssue, 251);
  assert.equal(record.content.supersededBy, null);
  assert.deepEqual(record.tags, ["shared-rag", "issue:251", "memory-bridge"]);
  assert.equal(record.metadata.repository, "marushu/vtdd-v2-p");
});

test("buildProposalRecord creates canonical proposal_log memory", () => {
  const record = buildProposalRecord({
    id: "proposal_251_test",
    relatedIssue: "251",
    hypothesis: "A bridge command can make shared memory testable before command-plane expansion.",
    option: ["inventory D1", "retrieve runtime cross memory"],
    proposedBy: "owner_and_codex",
    timestamp: "2026-05-11T10:01:00.000Z",
    concern: "Do not store full chat logs."
  });

  assert.equal(record.type, "proposal_log");
  assert.equal(record.content.relatedIssue, 251);
  assert.deepEqual(record.content.options, ["inventory D1", "retrieve runtime cross memory"]);
  assert.deepEqual(record.content.concerns, ["Do not store full chat logs."]);
});

test("memory record builders reject secret-bearing content", () => {
  assert.throws(
    () =>
      buildDecisionRecord({
        id: "decision_251_secret",
        relatedIssue: "251",
        decision: "token: super-secret-value",
        rationale: "This must be rejected.",
        decidedBy: "owner",
        timestamp: "2026-05-11T10:02:00.000Z"
      }),
    /unsafe memory record: memory_must_exclude_secrets/
  );
});

test("SQL builders target the expected D1 memory table", () => {
  assert.match(buildInventorySql(), /FROM vtdd_memory_records/);
  assert.match(buildCrossMemorySql({ relatedIssue: 251, limit: 3 }), /json_extract\(content_json, '\$\.relatedIssue'\) = 251/);

  const record = buildDecisionRecord({
    id: "decision_251_quote",
    relatedIssue: 251,
    decision: "Owner's bridge decision",
    rationale: "SQL strings must be escaped.",
    decidedBy: "owner",
    timestamp: "2026-05-11T10:03:00.000Z"
  });
  const sql = buildInsertRecordSql(record);
  assert.match(sql, /INSERT OR REPLACE INTO vtdd_memory_records/);
  assert.match(sql, /Owner''s bridge decision/);
});

test("runtime cross-memory request keeps auth in headers", () => {
  const request = buildRuntimeCrossMemoryRequest({
    runtimeUrl: "https://example.invalid",
    env: {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token"
    },
    relatedIssue: 251,
    text: "shared rag harness",
    limit: 5
  });

  const url = new URL(request.url);
  assert.equal(url.pathname, "/v2/retrieve/cross");
  assert.equal(url.searchParams.get("relatedIssue"), "251");
  assert.equal(url.searchParams.get("text"), "shared rag harness");
  assert.equal(request.headers.authorization, "Bearer test-token");
  assert.equal(request.url.includes("test-token"), false);
});

test("buildCheckpointPayload creates a compact RAG checkpoint payload", () => {
  const payload = buildCheckpointPayload({
    confirmed: "true",
    ownerConsent: "GO",
    repository: "marushu/vtdd-v2-p",
    relatedIssue: "361",
    summary: "Save current RAG checkpoint before compression.",
    checkpointReason: "Context compression risk.",
    thoughtLocation: "Owner and Codex discussion.",
    userTension: "Concerned but constructive.",
    originSurface: "mac_codex",
    originMoment: "Issue #343 implementation start",
    originTrigger: "Owner said それでいこう after #344 readiness audit.",
    userWord: ["それでいこう", "続けよう"],
    tensionSummary: "Owner accepted deferring #344 closure and moving to RAG recall hooks.",
    tensionIntensity: "medium",
    tensionMode: "steady",
    tensionWhyItMatters: "Future Butler recall should recover why #343 became the next slice.",
    hypothesis: "Use working_memory as checkpoint.",
    expectedFile: ["docs/memory-schema.md", "scripts/vtdd-memory.mjs"],
    evidenceLink: "https://github.com/marushu/vtdd-v2-p/issues/361",
    previousRecordId: "decision_360_example",
    timestamp: "2026-05-14T09:30:00.000Z"
  });

  assert.equal(payload.recordType, "working_memory");
  assert.equal(payload.confirmed, true);
  assert.equal(payload.relatedIssue, 361);
  assert.equal(payload.contextSourceQuality, "full_thread_context");
  assert.equal(payload.captureBoundary, "judgment_log_not_chain_of_thought");
  assert.deepEqual(payload.origin, {
    surface: "mac_codex",
    moment: "Issue #343 implementation start",
    trigger: "Owner said それでいこう after #344 readiness audit."
  });
  assert.deepEqual(payload.user_words, ["それでいこう", "続けよう"]);
  assert.deepEqual(payload.tension_note, {
    summary: "Owner accepted deferring #344 closure and moving to RAG recall hooks.",
    intensity: "medium",
    mode: "steady",
    why_it_matters: "Future Butler recall should recover why #343 became the next slice."
  });
  assert.deepEqual(payload.expectedFiles, ["docs/memory-schema.md", "scripts/vtdd-memory.mjs"]);
  assert.equal(payload.tags.includes("rag-checkpoint"), true);
  assert.equal(payload.tags.includes("memory-savepoint"), true);
});

test("runtime memory write request posts checkpoint without leaking auth into URL", () => {
  const payload = buildCheckpointPayload({
    confirmed: true,
    relatedIssue: 361,
    summary: "Checkpoint.",
    timestamp: "2026-05-14T09:31:00.000Z"
  });
  const request = buildRuntimeMemoryWriteRequest({
    runtimeUrl: "https://example.invalid",
    env: {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token"
    },
    payload
  });

  const body = JSON.parse(request.body);
  assert.equal(new URL(request.url).pathname, "/v2/action/memory-write");
  assert.equal(request.headers.authorization, "Bearer test-token");
  assert.equal(request.url.includes("test-token"), false);
  assert.equal(body.recordType, "working_memory");
  assert.equal(body.responseMode, "action_visible");
});

test("runtime operational memory request keeps auth in headers", () => {
  const request = buildRuntimeOperationalMemoryRequest({
    runtimeUrl: "https://example.invalid",
    env: {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token"
    },
    repository: "marushu/vtdd-v2-p",
    text: "setup recovery latency",
    recordId: "working_memory_343_repo_null_example",
    currentState: "deploy confirmed",
    runtimeTruthSource: "github_issue",
    checkedAt: "2026-05-15T02:36:00Z",
    limit: 3
  });

  const url = new URL(request.url);
  assert.equal(url.pathname, "/v2/retrieve/operational-memory");
  assert.equal(url.searchParams.get("repository"), "marushu/vtdd-v2-p");
  assert.equal(url.searchParams.get("text"), "setup recovery latency");
  assert.equal(url.searchParams.get("recordId"), "working_memory_343_repo_null_example");
  assert.equal(url.searchParams.get("responseMode"), "action_visible");
  assert.equal(request.headers.authorization, "Bearer test-token");
  assert.equal(request.url.includes("test-token"), false);
});

test("runtime machine auth resolves gateway bearer token from desktop vault", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vtdd-memory-vault-"));
  await fs.mkdir(path.join(root, "gateway"), { recursive: true });
  await fs.writeFile(path.join(root, "gateway", "bearer-token.txt"), "vault-token", "utf8");
  const manifestPath = path.join(root, "manifest.json");
  await fs.writeFile(
    manifestPath,
    JSON.stringify({
      version: 1,
      gateway: {
        bearerTokenPath: "gateway/bearer-token.txt"
      }
    }),
    "utf8"
  );

  const resolved = await withRuntimeMachineAuth({
    manifestPath,
    env: {},
    runtimeUrl: "https://example.invalid"
  });

  assert.equal(resolved.env.VTDD_GATEWAY_BEARER_TOKEN, "vault-token");
});

test("runtime machine auth prefers environment token over desktop vault", async () => {
  const resolved = await withRuntimeMachineAuth({
    manifestPath: "/does/not/exist.json",
    env: {
      VTDD_GATEWAY_BEARER_TOKEN: "env-token"
    },
    runtimeUrl: "https://example.invalid"
  });

  assert.equal(resolved.env.VTDD_GATEWAY_BEARER_TOKEN, "env-token");
});

test("runtime machine auth reports desktop maintenance required without leaking token", async () => {
  await assert.rejects(
    () =>
      withRuntimeMachineAuth({
        manifestPath: "/does/not/exist.json",
        env: {},
        runtimeUrl: "https://example.invalid"
      }),
    (error) => {
      assert.match(error.message, /desktop maintenance required: gateway_bearer_token_missing/);
      assert.equal(error.message.includes("Bearer"), false);
      return true;
    }
  );
});
