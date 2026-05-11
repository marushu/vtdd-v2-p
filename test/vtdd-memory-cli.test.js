import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCrossMemorySql,
  buildDecisionRecord,
  buildInsertRecordSql,
  buildInventorySql,
  buildProposalRecord,
  buildRuntimeCrossMemoryRequest,
  parseArgs
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
