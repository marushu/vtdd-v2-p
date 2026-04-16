import test from "node:test";
import assert from "node:assert/strict";
import {
  appendProposalLogFromGateway,
  createCanonicalProposalFromGateway,
  createInMemoryMemoryProvider,
  retrieveProposalLogReferences
} from "../src/core/index.js";

test("canonical proposal log is created from gateway payload", () => {
  const created = createCanonicalProposalFromGateway({
    actorRole: "butler",
    memoryRecord: {
      recordType: "proposal_log",
      content: {
        hypothesis: "Issue #20 の探索経緯を永続化する",
        options: ["worker保存のみ", "worker保存+retrieve API"],
        concerns: ["保存漏れ"],
        unresolvedQuestions: ["UIでどう見せるか"]
      },
      metadata: {
        proposedBy: "shuhei",
        relatedIssue: 20
      }
    }
  });

  assert.equal(created.ok, true);
  assert.equal(created.entry.relatedIssue, 20);
  assert.equal(created.entry.proposedBy, "shuhei");
});

test("canonical proposal log validation fails when required fields are missing", () => {
  const created = createCanonicalProposalFromGateway({
    actorRole: "butler",
    memoryRecord: {
      recordType: "proposal_log",
      content: {
        hypothesis: "Issue #20 の探索経緯を永続化する"
      }
    }
  });

  assert.equal(created.ok, false);
  assert.equal(created.issues.includes("options must be a non-empty array"), true);
});

test("proposal log runtime persists and retrieves references", async () => {
  const provider = createInMemoryMemoryProvider();
  const persisted = await appendProposalLogFromGateway(
    provider,
    {
      phase: "exploration",
      actorRole: "butler",
      memoryRecord: {
        recordType: "proposal_log",
        content: {
          hypothesis: "Issue化前の案を保存する",
          options: ["案A", "案B"],
          rejectedReasons: [{ option: "案A", reason: "安全境界が弱い" }],
          concerns: ["実行経路未接続のまま閉じるリスク"],
          unresolvedQuestions: ["出力整形をどうするか"],
          relatedIssue: 20,
          proposedBy: "butler"
        }
      }
    },
    {
      repository: "sample-org/vtdd-v2"
    }
  );

  assert.equal(persisted.ok, true);
  const retrieved = await retrieveProposalLogReferences(provider, {
    relatedIssue: 20,
    limit: 5
  });
  assert.equal(retrieved.ok, true);
  assert.equal(retrieved.references.length, 1);
  assert.equal(retrieved.references[0].hypothesis, "Issue化前の案を保存する");
  assert.equal(retrieved.references[0].repository, "sample-org/vtdd-v2");
});
