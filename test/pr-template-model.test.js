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
  "Surface Update Checklist",
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

test("pr template keeps explicit remaining-work guidance for partial PRs", () => {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");

  assert.match(
    template,
    /## Unsatisfied Success Criteria\s+- このPRスライス外に、未接続または未完了の owner-facing 作業が残っています。/
  );
  assert.match(template, /## Non-goal violations\s+None\./);
  assert.match(template, /## Extra changes \(if any\)\s+None\./);
});

test("pr template docs require Japanese-first owner-facing body guidance", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");

  assert.match(doc, /Owner-facing prose in generated PR bodies should be Japanese-first by default\./);
  assert.match(doc, /canonical section headings remain stable English guarded-policy markers/);
  assert.match(doc, /Dashboard Butler is the primary owner surface\./);
  assert.match(doc, /Custom GPT may be recorded only as a fallback surface/);
  assert.match(template, /Primary owner surface: Dashboard Butler/);
  assert.match(template, /Fallback surface: Custom GPT は明示された fallback surface/);
  assert.match(template, /Owner goal: このPRが扱う owner-facing goal/);
  assert.match(template, /Dashboard Butler natural-language path: Dashboard Butler の自然文/);
  assert.match(template, /Butler-facing E2E は未実施です。/);
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

test("pr template includes surface update checklist slots", () => {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");

  assert.match(template, /## Surface Update Checklist/);
  assert.match(template, /- Cloudflare deploy:/);
  assert.match(template, /- Custom GPT Action Schema update:/);
  assert.match(template, /- Custom GPT Instructions update:/);
  assert.match(template, /- iPhone Butler live E2E:/);
});
