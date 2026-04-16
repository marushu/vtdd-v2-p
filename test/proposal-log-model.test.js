import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PROPOSAL_LOG_FIELDS,
  createProposalLogEntry,
  createInMemoryLogStore
} from "../src/core/index.js";

const DOC_PATH = path.join(process.cwd(), "docs", "proposal-log-model.md");

test("proposal log docs list canonical fields", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");

  for (const field of PROPOSAL_LOG_FIELDS) {
    assert.match(doc, new RegExp(`- \`${field}\``));
  }
});

test("proposal log entry requires canonical fields with optional relatedIssue", () => {
  const result = createProposalLogEntry({
    hypothesis: "Keep proposal context in DB memory",
    options: ["store minimally", "store full decision-ready context"],
    rejectedReasons: [{ option: "store minimally", reason: "context gets lost" }],
    concerns: ["noise risk"],
    unresolvedQuestions: ["ranking order?"],
    proposedBy: "butler",
    timestamp: "2026-04-16T12:00:00.000Z"
  });

  assert.equal(result.ok, true);
  assert.equal(result.entry.relatedIssue, null);
});

test("proposal log store preserves pre-issue and issue-linked entries", () => {
  const store = createInMemoryLogStore();

  const preIssue = store.appendProposal({
    hypothesis: "Capture exploration before Issue exists",
    options: ["store now", "wait for issue"],
    rejectedReasons: [{ option: "wait for issue", reason: "history gets lost" }],
    concerns: ["missing traceability"],
    unresolvedQuestions: ["who confirms?"],
    proposedBy: "butler",
    timestamp: "2026-04-16T12:00:00.000Z"
  });
  assert.equal(preIssue.ok, true);

  const linked = store.appendProposal({
    hypothesis: "Attach context to Issue #20",
    options: ["link by relatedIssue"],
    rejectedReasons: [],
    concerns: [],
    unresolvedQuestions: [],
    relatedIssue: 20,
    proposedBy: "human",
    timestamp: "2026-04-16T12:10:00.000Z"
  });
  assert.equal(linked.ok, true);

  const all = store.listProposals();
  assert.equal(all.length, 2);

  const byIssue = store.listProposals({ relatedIssue: 20 });
  assert.equal(byIssue.length, 1);
  assert.equal(byIssue[0].hypothesis, "Attach context to Issue #20");
});
