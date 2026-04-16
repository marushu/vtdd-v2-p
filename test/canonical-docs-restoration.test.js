import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ISSUE_13_DRAFT_PATH = path.join(process.cwd(), "docs", "mvp", "issue-13-rewrite-draft.md");

const REQUIRED_DOCS = [
  "docs/vision/vtdd-v2-overview.md",
  "docs/architecture/basic-architecture.md",
  "docs/butler/role.md",
  "docs/butler/surface-independence.md",
  "docs/butler/context-resolution.md",
  "docs/memory/rag-memory-philosophy.md",
  "docs/security/threat-model.md",
  "docs/security/go-passkey-approval-model.md"
];

test("canonical docs restoration pack files exist", () => {
  for (const relativePath of REQUIRED_DOCS) {
    const absolutePath = path.join(process.cwd(), relativePath);
    assert.equal(fs.existsSync(absolutePath), true, `${relativePath} should exist`);
  }
});

test("issue #13 referenced canonical doc paths resolve", () => {
  const draft = fs.readFileSync(ISSUE_13_DRAFT_PATH, "utf8");
  for (const relativePath of REQUIRED_DOCS) {
    assert.equal(draft.includes(`- \`${relativePath}\``), true, `${relativePath} should be referenced`);
    const absolutePath = path.join(process.cwd(), relativePath);
    assert.equal(fs.existsSync(absolutePath), true, `${relativePath} should resolve from issue #13 draft`);
  }
});
