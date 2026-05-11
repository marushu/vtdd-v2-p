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
  assert.match(body, /## Butler Completion Contract/);
  assert.match(body, /## Surface Update Checklist/);
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
    unsatisfied: "Human review remains pending.",
    actionSchemaUpdate: "Not required.",
    iphoneButlerE2E: "Not required.",
    ownerGoal: "Prevent incomplete PR completion claims.",
    butlerEntrypoint: "PR body review gate.",
    actionSchemaExposure: "Not required for this docs/process guardrail.",
    runtimePath: "scripts/validate-pr-body.mjs.",
    runtimeTruth: "Validator pass/fail output.",
    authorityBoundary: "No high-risk operation.",
    butlerE2E: "Not required because this PR does not close a runtime Issue.",
    completionStatus: "incomplete",
  });
  const result = validatePrBody(body);
  assert.equal(result.ok, true);
});

test("validatePrBody fails when Butler Completion Contract is missing", () => {
  const result = validatePrBody(`## This PR satisfies Intent

- Add something.

## Satisfied Success Criteria

- Something.

## Unsatisfied Success Criteria

None.

## Verification Evidence

- Unit: None.
- Integration: None.
- E2E: None.
- Manual: None.
- Evidence path/link: None.

## Surface Update Checklist

- Cloudflare deploy: Not required.
- Custom GPT Action Schema update: Not required.
- Custom GPT Instructions update: Not required.
- iPhone Butler live E2E: Not required.
`);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Missing PR template marker: ## Butler Completion Contract/);
});

test("validatePrBody rejects closing PRs without complete Butler evidence", () => {
  const body = renderPrBody({
    issue: "57",
    intent: "Closes #57",
    satisfied: "Everything.",
    e2e: "`node --test test/pr-body-guardrail.test.js`",
    evidencePath: "test/pr-body-guardrail.test.js",
    ownerGoal: "Close a runtime-facing Issue.",
    butlerEntrypoint: "Butler natural-language intent.",
    actionSchemaExposure: "operationId exposed.",
    runtimePath: "Connected runtime path.",
    runtimeTruth: "Runtime truth reports success.",
    authorityBoundary: "GO + passkey where required.",
    butlerE2E: "None.",
    completionStatus: "incomplete",
  });

  const result = validatePrBody(body);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /status is not complete/);
  assert.match(result.errors.join("\n"), /Butler-facing E2E evidence is missing/);
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
      unsatisfied: "Human review remains pending.",
      evidencePath: "docs/pr-template-model.md",
      ownerGoal: "Prevent incomplete PR completion claims.",
      butlerEntrypoint: "PR body review gate.",
      actionSchemaExposure: "Not required for this docs/process guardrail.",
      runtimePath: "scripts/validate-pr-body.mjs.",
      runtimeTruth: "Validator pass/fail output.",
      authorityBoundary: "No high-risk operation.",
      butlerE2E: "Not required because this PR does not close a runtime Issue.",
      completionStatus: "incomplete",
    }),
  );

  const output = execFileSync("node", ["scripts/validate-pr-body.mjs", file], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.match(output, /PR body template validation passed/);
});

test("validate-pr-body CLI template mode accepts the canonical template structure", () => {
  const output = execFileSync(
    "node",
    ["scripts/validate-pr-body.mjs", "--template", ".github/pull_request_template.md"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  assert.match(output, /PR body template validation passed/);
});
