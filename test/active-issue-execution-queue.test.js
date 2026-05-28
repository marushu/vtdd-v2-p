import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const doc = fs.readFileSync("docs/mvp/active-issue-execution-queue.md", "utf8");

const OPEN_ISSUES_ON_2026_05_28 = [
  354, 355, 356, 358, 412, 413, 415, 417, 421, 444, 448, 450, 455, 491, 492,
  495, 497, 498, 501, 514, 528, 565, 573, 574, 577, 579, 580, 582, 585, 587,
  589, 590, 594, 595
];

test("active issue execution queue records every open issue from the rebuild snapshot", () => {
  for (const issueNumber of OPEN_ISSUES_ON_2026_05_28) {
    assert.equal(
      doc.includes(`Issue #${issueNumber}`),
      true,
      `Issue #${issueNumber} is missing from active issue execution queue`
    );
  }
});

test("active issue execution queue preserves queue policy and non-downscope boundary", () => {
  assert.equal(doc.includes("This file is not a scope reducer."), true);
  assert.equal(doc.includes("Do not move an Issue out of active scope by labeling it `Queue`."), true);
  assert.equal(doc.includes("## Root Blockers"), true);
  assert.equal(doc.includes("## Evidence Gaps"), true);
  assert.equal(doc.includes("## Blocked"), true);
  assert.equal(doc.includes("## Queue"), true);
});

test("active issue execution queue names current open PR hygiene", () => {
  assert.equal(doc.includes("PR #597 / Issue #528"), true);
  assert.equal(doc.includes("PR #591 / Issue #582"), true);
  assert.equal(doc.includes("guarded-policy"), true);
  assert.equal(doc.includes("grandfathered"), true);
});
