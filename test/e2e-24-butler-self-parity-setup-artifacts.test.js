import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-24-butler-self-parity-setup-artifacts.md"
);
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-24 evidence doc records Butler self-parity setup artifact runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(
    doc.includes(
      "node --test test/custom-gpt-setup-artifacts.test.js test/custom-gpt-setup-docs.test.js test/worker.test.js"
    ),
    true
  );
  assert.equal(doc.includes("/v2/retrieve/setup-artifact"), true);
  assert.equal(doc.includes("/v2/retrieve/self-parity"), true);
  assert.equal(doc.includes("proactively run self-parity before significant VTDD work"), true);
  assert.equal(doc.includes("Cloudflare deploy update required"), true);
  assert.equal(doc.includes("does not claim full Custom GPT editor-state introspection"), true);
});

test("issue-to-e2e matrix references E2E-24 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("## E2E-24 Butler self-parity setup artifacts"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-24-butler-self-parity-setup-artifacts.md"), true);
  assert.equal(doc.includes("- Issues: `#70`"), true);
});
