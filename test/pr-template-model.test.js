import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "pr-template-model.md");
const TEMPLATE_PATH = path.join(process.cwd(), ".github", "pull_request_template.md");

const CANONICAL_SECTIONS = [
  "This PR satisfies Intent",
  "Satisfied Success Criteria",
  "Unsatisfied Success Criteria",
  "Non-goal violations",
  "Verification Evidence",
  "Related Constitution Rules",
  "Out-of-scope but NOT implemented",
  "Extra changes (if any)"
];

test("pr template docs list canonical sections", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");

  for (const section of CANONICAL_SECTIONS) {
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(doc, new RegExp(`\\d+\\. \`${escaped}\``));
  }
});

test("pr template contains canonical sections in order", () => {
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

test("pr template uses plain None markers for empty sections", () => {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");

  assert.match(template, /## Unsatisfied Success Criteria\s+None\./);
  assert.match(template, /## Non-goal violations\s+None\./);
  assert.match(template, /## Extra changes \(if any\)\s+None\./);
});

test("pr template includes explicit verification slots", () => {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");

  assert.match(template, /## Verification Evidence/);
  assert.match(template, /- Unit:/);
  assert.match(template, /- Integration:/);
  assert.match(template, /- E2E:/);
  assert.match(template, /- Manual:/);
  assert.match(template, /- Evidence path\/link:/);
});
