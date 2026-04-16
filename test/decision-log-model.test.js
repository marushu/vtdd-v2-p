import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  DECISION_LOG_FIELDS,
  createDecisionLogEntry,
  createInMemoryLogStore
} from "../src/core/index.js";

const DOC_PATH = path.join(process.cwd(), "docs", "decision-log-model.md");

test("decision log docs list canonical fields", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");

  for (const field of DECISION_LOG_FIELDS) {
    assert.match(doc, new RegExp(`- \`${field}\``));
  }
});

test("decision log entry requires canonical fields except optional supersededBy", () => {
  const result = createDecisionLogEntry({
    decision: "Keep issue as spec",
    rationale: "Prevents execution drift",
    relatedIssue: 17,
    decidedBy: "butler",
    timestamp: "2026-04-16T12:00:00.000Z"
  });

  assert.equal(result.ok, true);
  assert.equal(result.entry.supersededBy, null);
});

test("decision log store preserves superseded records", () => {
  const store = createInMemoryLogStore();

  const first = store.appendDecision({
    decision: "Use initial retrieval order",
    rationale: "Match current execution contract",
    relatedIssue: 17,
    decidedBy: "butler",
    timestamp: "2026-04-16T12:00:00.000Z"
  });
  assert.equal(first.ok, true);

  const second = store.appendDecision({
    decision: "Revise retrieval order",
    rationale: "Later issue refined the contract",
    relatedIssue: 17,
    decidedBy: "human",
    timestamp: "2026-04-16T12:10:00.000Z"
  });
  assert.equal(second.ok, true);

  const supersede = store.supersedeDecision({
    id: first.entry.id,
    supersededBy: second.entry.id
  });
  assert.equal(supersede.ok, true);

  const listed = store.listDecisions({ relatedIssue: 17 });
  assert.equal(listed.length, 2);
  assert.equal(listed[0].supersededBy, second.entry.id);
  assert.equal(listed[1].supersededBy, null);
});
