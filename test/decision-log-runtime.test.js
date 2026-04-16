import test from "node:test";
import assert from "node:assert/strict";
import {
  appendDecisionLogFromGateway,
  createCanonicalDecisionFromGateway,
  createInMemoryMemoryProvider,
  retrieveDecisionLogReferences
} from "../src/core/index.js";

test("canonical decision log is created from gateway payload", () => {
  const created = createCanonicalDecisionFromGateway({
    actorRole: "butler",
    memoryRecord: {
      recordType: "decision_log",
      content: {
        decision: "Issue #17 を再接続する",
        rationale: "Butler が理由を参照できるようにする",
        relatedIssue: 17
      },
      metadata: {
        decidedBy: "shuhei"
      }
    }
  });

  assert.equal(created.ok, true);
  assert.equal(created.entry.relatedIssue, 17);
  assert.equal(created.entry.decidedBy, "shuhei");
});

test("canonical decision log validation fails when required fields are missing", () => {
  const created = createCanonicalDecisionFromGateway({
    actorRole: "butler",
    memoryRecord: {
      recordType: "decision_log",
      content: {
        decision: "Issue #17 を再接続する",
        relatedIssue: 17
      }
    }
  });

  assert.equal(created.ok, false);
  assert.equal(created.issues.includes("rationale is required"), true);
});

test("decision log runtime persists and retrieves references", async () => {
  const provider = createInMemoryMemoryProvider();
  const persisted = await appendDecisionLogFromGateway(
    provider,
    {
      phase: "execution",
      actorRole: "butler",
      memoryRecord: {
        recordType: "decision_log",
        content: {
          decision: "Issue #17 の保存経路を接続",
          rationale: "主要判断を RAG 参照可能にする",
          relatedIssue: 17,
          decidedBy: "butler"
        }
      }
    },
    {
      repository: "sample-org/vtdd-v2"
    }
  );

  assert.equal(persisted.ok, true);
  const retrieved = await retrieveDecisionLogReferences(provider, {
    relatedIssue: 17,
    limit: 5
  });
  assert.equal(retrieved.ok, true);
  assert.equal(retrieved.references.length, 1);
  assert.equal(retrieved.references[0].decision, "Issue #17 の保存経路を接続");
  assert.equal(retrieved.references[0].repository, "sample-org/vtdd-v2");
});
