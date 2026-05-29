import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const doc = fs.readFileSync("docs/mvp/active-issue-execution-queue.md", "utf8");

const OPEN_ISSUES_ON_2026_05_29 = [
  354, 355, 356, 358, 412, 413, 415, 417, 421, 444, 448, 450, 455, 491, 492,
  495, 497, 498, 501, 514, 528, 565, 574, 577, 579, 580, 582, 585, 587, 589,
  590, 594, 595, 599, 604, 605, 606, 613, 620
];

const CLASSIFICATION_SECTIONS = [
  "Now",
  "Next",
  "Root Blockers",
  "Open PR Hygiene",
  "Evidence Gaps",
  "Blocked",
  "Queue",
  "Questions"
];

function sectionBody(sectionName) {
  const sectionStart = doc.indexOf(`\n## ${sectionName}\n`);
  assert.notEqual(sectionStart, -1, `${sectionName} section is missing`);

  const nextSectionStart = doc.indexOf("\n## ", sectionStart + 1);
  return doc.slice(
    sectionStart,
    nextSectionStart === -1 ? doc.length : nextSectionStart
  );
}

const classifiedIssueText = CLASSIFICATION_SECTIONS.map(sectionBody).join("\n");

test("active issue execution queue records every open issue from the rebuild snapshot", () => {
  for (const issueNumber of OPEN_ISSUES_ON_2026_05_29) {
    assert.equal(
      doc.includes(`Issue #${issueNumber}`),
      true,
      `Issue #${issueNumber} is missing from active issue execution queue`
    );
  }
});

test("active issue execution queue classifies every open issue outside the runtime snapshot", () => {
  for (const issueNumber of OPEN_ISSUES_ON_2026_05_29) {
    assert.equal(
      new RegExp(`^- Issue #${issueNumber}:`, "m").test(classifiedIssueText),
      true,
      `Issue #${issueNumber} does not have a dedicated classification bullet`
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
  assert.equal(doc.includes("No open PRs were present before this refresh PR was opened."), true);
  assert.equal(doc.includes("PR #591 / Issue #582 merged"), true);
  assert.equal(doc.includes("PR #597 / Issue #528 merged"), true);
  assert.equal(doc.includes("PR #598 / Issue #595 merged"), true);
  assert.equal(doc.includes("PR #600 / Issue #444 merged"), true);
  assert.equal(doc.includes("PR #602 / Issue #601 merged"), true);
  assert.equal(doc.includes("PR #603 / Issue #450 merged"), true);
  assert.equal(doc.includes("PR #607 / Issue #413 merged"), true);
  assert.equal(doc.includes("PR #608 / Issue #595 merged"), true);
  assert.equal(doc.includes("PR #610 and PR #611 / Issue #609"), true);
  assert.equal(doc.includes("PR #612 / Issue #573"), true);
  assert.equal(doc.includes("No open grandfathered PRs remain."), true);
});

test("active issue execution queue names the next automatic implementation lane", () => {
  assert.equal(sectionBody("Now").includes("Issue #606: ordinary Dashboard read sessions"), true);
  assert.equal(sectionBody("Next").includes("Issue #590: app-server turn timeout"), true);
  assert.equal(doc.includes("Issue #579: after timeout recovery"), true);
});
