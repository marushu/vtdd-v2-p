import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (filePath) => fs.readFileSync(filePath, "utf8");

test("github operation plane fixes full-scope capability and forbids narrowing", () => {
  const doc = read("docs/security/github-operation-plane.md");

  assert.equal(doc.includes("Issues #42"), true);
  assert.equal(doc.includes("#244"), true);
  assert.equal(doc.includes("GitHub operation capability is full-scope by default."), true);
  assert.equal(doc.includes("Capability narrowing is prohibited."), true);
  assert.equal(doc.includes("Execution is controlled by approval tiers:"), true);
  assert.equal(doc.includes("`read`"), true);
  assert.equal(doc.includes("`GO`"), true);
  assert.equal(doc.includes("`GO + real passkey`"), true);
});

test("github operation plane covers required GitHub operation groups", () => {
  const doc = read("docs/security/github-operation-plane.md");

  assert.equal(doc.includes("- repositories"), true);
  assert.equal(doc.includes("- issues"), true);
  assert.equal(doc.includes("- issue comments"), true);
  assert.equal(doc.includes("- pulls"), true);
  assert.equal(doc.includes("- reviews and review comments"), true);
  assert.equal(doc.includes("- checks, statuses, and workflow runs"), true);
  assert.equal(doc.includes("- branches and refs"), true);
  assert.equal(doc.includes("- merge"), true);
  assert.equal(doc.includes("- issue close"), true);
  assert.equal(doc.includes("- PR close / reopen / state transition"), true);
  assert.equal(doc.includes("- Issue body, title, state, label, assignee, and milestone update"), true);
  assert.equal(doc.includes("- secret, variable, and settings mutations"), true);
  assert.equal(doc.includes("- repository settings, rulesets, environments, pages, and webhooks"), true);
  assert.equal(
    doc.includes("- repository permissions, collaborators, teams, and GitHub App installation state"),
    true
  );
  assert.equal(doc.includes("- releases, tags, and packages"), true);
  assert.equal(doc.includes("- deployments, environments, and deployment statuses"), true);
  assert.equal(doc.includes("- repository archive, delete, transfer, visibility, and destructive cleanup"), true);
});

test("github operation plane binds #244 to the queryable owner operation inventory", () => {
  const doc = read("docs/security/github-operation-plane.md");

  assert.equal(doc.includes("Issue #244 supersedes the earlier basic matrix in #153."), true);
  assert.equal(doc.includes("`src/core/github-owner-operation-inventory.js`"), true);
  assert.equal(doc.includes("status: `supported`, `gated`, `unsupported`, or `intentionally_blocked`"), true);
  assert.equal(doc.includes("Unsupported rows are not treated as a steady-state GitHub UI fallback."), true);
  assert.equal(doc.includes("Intentionally blocked rows are still inventory rows."), true);
});

test("github operation plane keeps Butler-side authority and GitHub App credential model", () => {
  const doc = read("docs/security/github-operation-plane.md");
  const approvalDoc = read("docs/security/consent-approval-model.md");

  assert.equal(doc.includes("GitHub App is the canonical credential model."), true);
  assert.equal(doc.includes("Long-lived PAT-style execution tokens must not be introduced as the default."), true);
  assert.equal(doc.includes("Codex does not merge or close issues directly."), true);
  assert.equal(doc.includes("Merge and issue close remain Butler-side authority actions."), true);
  assert.equal(doc.includes("### `GO + real passkey`"), true);
  assert.equal(doc.includes("- merge"), true);
  assert.equal(doc.includes("- bounded issue close after merged scoped work"), true);
  assert.equal(approvalDoc.includes("github-operation-plane.md"), true);
});
