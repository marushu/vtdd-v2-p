import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { RetrievalSource, buildRetrievalPlan } from "../src/core/index.js";

const CONTEXT_RESOLUTION_DOC = path.join(
  process.cwd(),
  "docs",
  "butler",
  "context-resolution.md"
);

test("execution retrieval plan preserves issue-first canonical source order", () => {
  const plan = buildRetrievalPlan({
    phase: "execution",
    includeProposal: true,
    includeConversation: false
  });

  assert.deepEqual(plan.sources.slice(0, 5), [
    RetrievalSource.ISSUE,
    RetrievalSource.CONSTITUTION,
    RetrievalSource.RUNTIME_TRUTH,
    RetrievalSource.DECISION_LOG,
    RetrievalSource.PROPOSAL_LOG
  ]);
  assert.equal(plan.sources.includes(RetrievalSource.PR_CONTEXT), true);
});

test("butler context resolution doc fixes recall context source order", () => {
  const doc = fs.readFileSync(CONTEXT_RESOLUTION_DOC, "utf8");
  assert.equal(doc.includes("1. Issue"), true);
  assert.equal(doc.includes("2. Constitution"), true);
  assert.equal(doc.includes("3. Decision Log"), true);
  assert.equal(doc.includes("4. Proposal / Exploration Log"), true);
  assert.equal(doc.includes("5. PR metadata / review summaries"), true);
});
