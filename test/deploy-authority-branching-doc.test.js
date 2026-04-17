import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "deploy-authority-branching.md");

test("deploy authority branching doc compares candidate paths and fixes first candidate", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("### Path A: VTDD -> one-shot GitHub Actions deploy"), true);
  assert.equal(doc.includes("### Path B: VTDD -> direct provider deploy"), true);
  assert.equal(doc.includes("### Path C: VTDD -> SSH / external runner"), true);
  assert.equal(doc.includes("keep Path A as the first implementation candidate"), true);
  assert.equal(doc.includes("keep Path B as the preferred portability-oriented follow-up"), true);
  assert.equal(doc.includes("keep Path C out of current MVP scope"), true);
});

test("deploy authority branching doc fixes invariants against permanent github deploy authority", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("deploy requires `GO + passkey`"), true);
  assert.equal(doc.includes("deploy authority must be short-lived or one-shot"), true);
  assert.equal(doc.includes("GitHub Actions must not require permanent production deploy authority"), true);
  assert.equal(doc.includes("a mistaken push to `main` must not immediately imply production deploy"), true);
});

test("deploy authority branching doc preserves issue 37 relationship without forcing github pro", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("private repositories on GitHub Free"), true);
  assert.equal(doc.includes("solo operators who do not want to buy GitHub Pro only for branch protection"), true);
  assert.equal(doc.includes("GitHub-hosted protection is optional hardening, not the root safety model"), true);
});
