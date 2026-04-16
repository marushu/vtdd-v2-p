import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "issue-template-model.md");
const TEMPLATE_PATH = path.join(process.cwd(), ".github", "ISSUE_TEMPLATE", "spec-issue.md");

const CANONICAL_SECTIONS = [
  "Intent",
  "Success Criteria",
  "Completion Gate",
  "Validation Plan",
  "Non-goal",
  "Open Questions",
  "Related Issues / Rules"
];

test("issue template docs list canonical sections", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");

  for (const section of CANONICAL_SECTIONS) {
    assert.match(doc, new RegExp(`\\d+\\. \`${section.replace("/", "\\/")}\``));
  }
});

test("spec issue template contains canonical sections in order", () => {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");

  let lastIndex = -1;
  for (const section of CANONICAL_SECTIONS) {
    const marker = `## ${section}`;
    const nextIndex = template.indexOf(marker);
    assert.notEqual(nextIndex, -1, `missing section: ${marker}`);
    assert.ok(nextIndex > lastIndex, `${marker} must appear after previous canonical section`);
    lastIndex = nextIndex;
  }
});

test("spec issue template includes completion and validation slots", () => {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");

  assert.match(template, /## Completion Gate/);
  assert.match(template, /- \[ \] code merged/);
  assert.match(template, /- \[ \] required tests pass/);
  assert.match(template, /- \[ \] mapped E2E passes/);
  assert.match(template, /- \[ \] human approval/);

  assert.match(template, /## Validation Plan/);
  assert.match(template, /- Unit:/);
  assert.match(template, /- Integration:/);
  assert.match(template, /- E2E:/);
  assert.match(template, /- Evidence path\/link:/);
});
