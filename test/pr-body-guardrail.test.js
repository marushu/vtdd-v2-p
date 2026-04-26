import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { renderPrBody } from "../scripts/render-pr-body.mjs";
import { validatePrBody } from "../scripts/validate-pr-body.mjs";

test("renderPrBody includes all guarded-policy headings", () => {
  const body = renderPrBody({
    issue: "57",
    intent: "Prevent repeated PR body guard failures.",
    satisfied: "Helper generates all required sections.",
  });

  assert.match(body, /## This PR satisfies Intent/);
  assert.match(body, /## Satisfied Success Criteria/);
  assert.match(body, /## Unsatisfied Success Criteria/);
  assert.match(body, /## Verification Evidence/);
});

test("validatePrBody fails when required markers are missing", () => {
  const result = validatePrBody("## Summary\n\nNot enough.");
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Missing PR template marker/);
});

test("validatePrBody accepts rendered body", () => {
  const body = renderPrBody({
    issue: "57",
    intent: "Prevent repeated PR body guard failures.",
    satisfied: "Helper generates all required sections.",
    unit: "`node --test test/pr-body-guardrail.test.js`",
    evidencePath: "docs/pr-template-model.md",
  });
  const result = validatePrBody(body);
  assert.equal(result.ok, true);
});

test("validate-pr-body CLI passes on rendered file", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "vtdd-pr-body-"));
  const file = path.join(tmpdir, "body.md");
  fs.writeFileSync(
    file,
    renderPrBody({
      issue: "57",
      intent: "Prevent repeated PR body guard failures.",
      satisfied: "Helper generates all required sections.",
      evidencePath: "docs/pr-template-model.md",
    }),
  );

  const output = execFileSync("node", ["scripts/validate-pr-body.mjs", file], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.match(output, /PR body template validation passed/);
});
