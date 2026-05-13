import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { renderIssueBody, validateIssueBody } from "../src/core/issue-body.js";
import { prepareIssueBody, prepareIssueBodyFile } from "../scripts/prepare-issue-body-file.mjs";

test("renderIssueBody produces the canonical Issue sections", () => {
  const body = renderIssueBody({
    intent: "このIssueは、なぜこの作業を行うのかと次にどこから再開するのかを日本語で残す。",
    success: "- [ ] 日本語優先 guard が通る",
    unit: "node --test test/issue-body-guardrail.test.js",
    integration: "Issue body writer から validator へ接続する",
    e2e: "英語中心の Issue body を block する",
    evidencePath: "test/issue-body-guardrail.test.js",
    nonGoal: "deploy はしない",
    openQuestions: "なし",
    related: "Related Issue: Issue #342"
  });

  for (const marker of [
    "## Intent",
    "## Success Criteria",
    "## Completion Gate",
    "## Validation Plan",
    "## Non-goal",
    "## Open Questions",
    "## Related Issues / Rules"
  ]) {
    assert.equal(body.includes(marker), true, marker);
  }
});

test("validateIssueBody rejects English-first Issue bodies", () => {
  const result = validateIssueBody(`## Intent

Create a shared startup preflight for all agents.

## Success Criteria

- [ ] It works.

## Completion Gate

- [ ] code merged

## Validation Plan

- Unit: tests

## Non-goal

- None.

## Open Questions

- None.

## Related Issues / Rules

- Related Issue: #344
`);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Japanese-first|English-heavy/);
});

test("validateIssueBody accepts Japanese-first Issue bodies with restart context", () => {
  const body = renderIssueBody({
    intent: "このIssueは、後でownerが戻ってきた時に、なぜこのguardを作るのかと次にどこから再開するのかを思い出せるようにする。",
    success: "- [ ] Issue body validator が日本語中心の本文を通す",
    unit: "node --test test/issue-body-guardrail.test.js",
    integration: "prepare helper が validator を通した body-file を作る",
    e2e: "英語中心の本文が block される",
    evidencePath: "test/issue-body-guardrail.test.js",
    nonGoal: "Custom GPT Action Schema は変更しない",
    openQuestions: "なし",
    related: "Related Issue: Issue #342"
  });

  const result = validateIssueBody(body);
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("prepareIssueBody preserves valid candidates and normalizes invalid ones", async () => {
  const valid = renderIssueBody({
    intent: "このIssueは、なぜ保存するのかと次に何を確認するのかを日本語で残す。",
    success: "- [ ] candidate がそのまま通る",
    unit: "node --test test/issue-body-guardrail.test.js",
    integration: "prepareIssueBody",
    e2e: "validator output",
    evidencePath: "test/issue-body-guardrail.test.js",
    nonGoal: "なし",
    openQuestions: "なし",
    related: "Related Issue: Issue #342"
  });
  const preserved = prepareIssueBody({
    candidateBody: valid,
    renderBody: () => "should not be used"
  });
  assert.equal(preserved.ok, true);
  assert.equal(preserved.normalized, false);

  const normalized = prepareIssueBody({
    candidateBody: "## Summary\n\nBroken.",
    renderBody: () => valid
  });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.normalized, true);
});

test("validate-issue-body CLI passes on prepared file", async () => {
  const tmpdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "vtdd-issue-body-"));
  const file = path.join(tmpdir, "issue.md");
  await prepareIssueBodyFile({
    outputPath: file,
    renderBody: () =>
      renderIssueBody({
        intent: "このIssueは、ownerがあとで戻った時に、なぜこの作業をするのかと次に何をするのかを読めるようにする。",
        success: "- [ ] CLI validator が通る",
        unit: "node --test test/issue-body-guardrail.test.js",
        integration: "prepareIssueBodyFile",
        e2e: "body-file validation",
        evidencePath: "test/issue-body-guardrail.test.js",
        nonGoal: "deploy はしない",
        openQuestions: "なし",
        related: "Related Issue: Issue #342"
      })
  });

  const output = execFileSync("node", ["scripts/validate-issue-body.mjs", file], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  assert.match(output, /Issue body validation passed/);
});
