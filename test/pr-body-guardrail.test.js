import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { prepareGuardedPullRequestBody, prepareGuardedPullRequestBodyFile } from "../scripts/prepare-pr-body-file.mjs";
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
  assert.match(body, /## Dry-run Impact Report/);
  assert.match(body, /## Execution Queue Delta/);
  assert.match(body, /## File \/ Line Hypotheses/);
  assert.match(body, /## Hypothesis Retrospective/);
  assert.match(body, /## Verification Evidence/);
  assert.match(body, /## Butler Completion Contract/);
  assert.match(body, /## Surface Update Checklist/);
});

test("renderPrBody default guidance is Japanese-first while headings remain stable", () => {
  const body = renderPrBody({
    issue: "316"
  });

  assert.match(body, /## This PR satisfies Intent/);
  assert.match(body, /#316 の部分進捗です。/);
  assert.match(body, /このPRスライス外に、未接続または未完了の owner-facing 作業が残っています。/);
  assert.match(body, /Primary owner surface: Dashboard Butler/);
  assert.match(body, /Fallback surface: Custom GPT は明示された fallback surface/);
  assert.match(body, /Owner goal: このPRが扱う owner-facing goal/);
  assert.match(body, /Dashboard Butler natural-language path: Dashboard Butler の自然文/);
  assert.match(body, /Butler-facing E2E は未実施です。/);
  assert.match(body, /Target Issue: Issue #316/);
  assert.match(body, /この Issue だけを見て直すと壊れ得るもの/);
  assert.match(body, /Queue position before: Issue #316 は active issue execution queue/);
  assert.match(body, /Active Issues は縮小しません。/);
  assert.match(body, /should become RAG candidate: 未判断。/);
  assert.match(body, /Cloudflare deploy: 不要。/);
});

test("renderPrBody default partial template passes validator without Butler placeholders", () => {
  const body = renderPrBody({
    issue: "57",
    intent: "Prevent repeated PR body guard failures.",
    satisfied: "Helper generates all required sections."
  });

  const result = validatePrBody(body);
  assert.equal(result.ok, true);
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

test("renderPrBody normalizes partial completion status into incomplete", () => {
  const body = renderPrBody({
    issue: "57",
    intent: "Prevent repeated PR body guard failures.",
    satisfied: "Helper generates all required sections.",
    completionStatus: "partial"
  });

  assert.match(body, /- Completion status: incomplete/);
  const result = validatePrBody(body);
  assert.equal(result.ok, true);
});

test("validatePrBody fails when execution queue delta is missing", () => {
  const body = renderPrBody({
    issue: "595",
    intent: "Issue #595 の queue delta guardrail を固定する。",
    satisfied: "Canonical helper generates queue delta.",
    unsatisfied: "Human review remains pending.",
    evidencePath: "docs/butler/execution-queue-contract.md",
    ownerGoal: "Owner input を即実装せず queue で扱う。",
    butlerEntrypoint: "PR body review gate.",
    actionSchemaExposure: "No schema change.",
    runtimePath: "scripts/validate-pr-body.mjs.",
    runtimeTruth: "Validator pass/fail output.",
    authorityBoundary: "No high-risk operation.",
    butlerE2E: "Not required because this PR does not close a runtime Issue.",
    completionStatus: "incomplete",
  }).replace(/\n## Execution Queue Delta[\s\S]*?\n## File \/ Line Hypotheses/, "\n## File / Line Hypotheses");

  const result = validatePrBody(body);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Missing PR template marker: ## Execution Queue Delta/);
});

test("validatePrBody rejects empty execution queue delta fields", () => {
  const body = renderPrBody({
    issue: "595",
    intent: "Issue #595 の queue delta guardrail を固定する。",
    satisfied: "Canonical helper generates queue delta.",
    unsatisfied: "Human review remains pending.",
    evidencePath: "docs/butler/execution-queue-contract.md",
    ownerGoal: "Owner input を即実装せず queue で扱う。",
    butlerEntrypoint: "PR body review gate.",
    actionSchemaExposure: "No schema change.",
    runtimePath: "scripts/validate-pr-body.mjs.",
    runtimeTruth: "Validator pass/fail output.",
    authorityBoundary: "No high-risk operation.",
    butlerE2E: "Not required because this PR does not close a runtime Issue.",
    completionStatus: "incomplete",
  }).replace(/- Why this PR is next: .+/, "- Why this PR is next: None.");

  const result = validatePrBody(body);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Execution Queue Delta field is not filled: Why this PR is next/);
});

test("validatePrBody rejects semantically vague execution queue delta fields", () => {
  const body = renderPrBody({
    issue: "595",
    intent: "Issue #595 の queue delta guardrail を固定する。",
    satisfied: "Canonical helper generates queue delta.",
    unsatisfied: "Human review remains pending.",
    preemptionDecision: "No interruption needed.",
    queueDelta: "Some work moved.",
    activeIssuesNotDownscoped: "N/A.",
    evidencePath: "docs/butler/execution-queue-contract.md",
    ownerGoal: "Owner input を即実装せず queue で扱う。",
    butlerEntrypoint: "PR body review gate.",
    actionSchemaExposure: "No schema change.",
    runtimePath: "scripts/validate-pr-body.mjs.",
    runtimeTruth: "Validator pass/fail output.",
    authorityBoundary: "No high-risk operation.",
    butlerE2E: "Not required because this PR does not close a runtime Issue.",
    completionStatus: "incomplete",
  });

  const result = validatePrBody(body);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Preemption decision must name one queue classification/);
  assert.match(result.errors.join("\n"), /Queue delta must name the Issue\/PR or queue bucket/);
  assert.match(result.errors.join("\n"), /active Issues are not downscoped/);
});

test("validatePrBody rejects PR bodies that make Custom GPT or Action Schema the primary path", () => {
  const body = renderPrBody({
    issue: "595",
    intent: "Issue #595 の Dashboard Butler First guardrail を固定する。",
    satisfied: "Validator catches surface drift.",
    unsatisfied: "Human review remains pending.",
    primaryOwnerSurface: "Custom GPT.",
    fallbackSurface: "Custom GPT supported surface.",
    dashboardNaturalLanguagePath: "Internal route only.",
    actionSchemaExposure: "Action Schema is the primary owner path.",
    evidencePath: "docs/pr-template-model.md",
    ownerGoal: "Dashboard Butler First からのドリフトを止める。",
    butlerEntrypoint: "PR body review gate.",
    runtimePath: "scripts/validate-pr-body.mjs.",
    runtimeTruth: "Validator pass/fail output.",
    authorityBoundary: "No high-risk operation.",
    butlerE2E: "Not required because this PR does not close a runtime Issue.",
    completionStatus: "incomplete",
  });

  const result = validatePrBody(body);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Primary owner surface must be Dashboard Butler only/);
  assert.match(result.errors.join("\n"), /Fallback surface may name Custom GPT only as fallback/);
  assert.match(result.errors.join("\n"), /natural-language\/chat entrypoint/);
  assert.match(result.errors.join("\n"), /Action Schema exposure must not be described as the primary owner path/);
});

test("validatePrBody rejects contradictory primary surface text that merely mentions Dashboard Butler", () => {
  const body = renderPrBody({
    issue: "595",
    intent: "Issue #595 の Dashboard Butler First guardrail を固定する。",
    satisfied: "Validator catches contradictory surface text.",
    unsatisfied: "Human review remains pending.",
    primaryOwnerSurface: "Custom GPT, not Dashboard Butler.",
    evidencePath: "docs/pr-template-model.md",
    ownerGoal: "Dashboard Butler First からのドリフトを止める。",
    butlerEntrypoint: "PR body review gate.",
    dashboardNaturalLanguagePath: "Dashboard Butler natural-language chat entrypoint is required in the PR body.",
    actionSchemaExposure: "Action Schema is not the primary owner path.",
    runtimePath: "scripts/validate-pr-body.mjs.",
    runtimeTruth: "Validator pass/fail output.",
    authorityBoundary: "No high-risk operation.",
    butlerE2E: "Not required because this PR does not close a runtime Issue.",
    completionStatus: "incomplete",
  });

  const result = validatePrBody(body);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Primary owner surface must be Dashboard Butler only/);
  assert.doesNotMatch(result.errors.join("\n"), /Action Schema exposure must not/);
});

test("validatePrBody accepts explicit Action Schema negation and rejects vague natural-language path", () => {
  const valid = renderPrBody({
    issue: "595",
    intent: "Issue #595 の Dashboard Butler First guardrail を固定する。",
    satisfied: "Validator accepts a negated Action Schema primary-path statement.",
    unsatisfied: "Human review remains pending.",
    evidencePath: "docs/pr-template-model.md",
    ownerGoal: "Dashboard Butler First からのドリフトを止める。",
    butlerEntrypoint: "PR body review gate.",
    dashboardNaturalLanguagePath: "Dashboard Butler natural-language chat entrypoint must be explained in this PR body.",
    actionSchemaExposure: "Action Schema is not the primary owner path; it is Custom GPT fallback compatibility only.",
    runtimePath: "scripts/validate-pr-body.mjs.",
    runtimeTruth: "Validator pass/fail output.",
    authorityBoundary: "No high-risk operation.",
    butlerE2E: "Not required because this PR does not close a runtime Issue.",
    completionStatus: "incomplete",
  });
  assert.equal(validatePrBody(valid).ok, true);

  const vague = renderPrBody({
    issue: "595",
    intent: "Issue #595 の Dashboard Butler First guardrail を固定する。",
    satisfied: "Validator rejects vague path text.",
    unsatisfied: "Human review remains pending.",
    dashboardNaturalLanguagePath: "Dashboard Butler natural-language placeholder.",
    evidencePath: "docs/pr-template-model.md",
    ownerGoal: "Dashboard Butler First からのドリフトを止める。",
    butlerEntrypoint: "PR body review gate.",
    actionSchemaExposure: "Action Schema is not the primary owner path.",
    runtimePath: "scripts/validate-pr-body.mjs.",
    runtimeTruth: "Validator pass/fail output.",
    authorityBoundary: "No high-risk operation.",
    butlerE2E: "Not required because this PR does not close a runtime Issue.",
    completionStatus: "incomplete",
  });

  const result = validatePrBody(vague);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /natural-language\/chat entrypoint/);
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

test("validatePrBody fails when dry-run impact report is missing", () => {
  const result = validatePrBody(`## This PR satisfies Intent

- Add something.

## Satisfied Success Criteria

- Something.

## Unsatisfied Success Criteria

- Remaining work.

## Non-goal violations

None.

## File / Line Hypotheses

- file: \`src/example.js:1\`
  - hypothesis: Something.

## Hypothesis Retrospective

- expected: Something.

## Verification Evidence

- Unit: None.
- Integration: None.
- E2E: None.
- Manual: None.
- Evidence path/link: None.

## Butler Completion Contract

- Owner goal: Some owner goal.
- Butler entrypoint: Some entrypoint.
- Action Schema exposure: No schema change.
- Runtime path: Some path.
- Runner/runtime truth: Some truth.
- Authority boundary: No high-risk operation.
- E2E evidence: Not required for this guardrail path.
- Completion status: incomplete

## Surface Update Checklist

- Cloudflare deploy: Not required.
- Custom GPT Action Schema update: Not required.
- Custom GPT Instructions update: Not required.
- iPhone Butler live E2E: Not required.
`);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Missing PR template marker: ## Dry-run Impact Report/);
});

test("validatePrBody rejects empty dry-run impact fields", () => {
  const body = renderPrBody({
    issue: "360",
    intent: "Issue #360 の dry-run impact gate を PR body に固定する。",
    satisfied: "Dry-run sections are present.",
    unsatisfied: "Issue #355 への適用 evidence は後続。",
    dryRunExpectedTouched: "",
    ownerGoal: "実装前の交通整理を PR に残す。",
    butlerEntrypoint: "PR body guardrail.",
    actionSchemaExposure: "No schema change.",
    runtimePath: "scripts/validate-pr-body.mjs.",
    runtimeTruth: "Validator pass/fail output.",
    authorityBoundary: "No high-risk operation.",
    butlerE2E: "Not required for this docs/process guardrail.",
    completionStatus: "incomplete",
  }).replace("- Expected touched files/routes/workflows: 想定ファイル、route、workflow、docs を明記してください。", "- Expected touched files/routes/workflows: None.");

  const result = validatePrBody(body);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Dry-run Impact Report field is not filled: Expected touched files\/routes\/workflows/);
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
    authorityBoundary: "scoped passkey approval where required.",
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

test("guarded workflow grandfathers pre-queue open PRs while enforcing new queue fields", () => {
  const workflow = fs.readFileSync(".github/workflows/guarded-autonomy-required-checks.yml", "utf8");

  assert.match(workflow, /queue_delta_enforced_from_pr=596/);
  assert.match(workflow, /Skipping Execution Queue Delta enforcement for grandfathered PR/);
  assert.match(workflow, /Preemption decision must name one queue classification/);
  assert.match(workflow, /Queue delta must name the Issue\/PR or queue bucket being moved/);
});

test("guarded workflow enforces Dashboard Butler as the primary owner surface", () => {
  const workflow = fs.readFileSync(".github/workflows/guarded-autonomy-required-checks.yml", "utf8");

  assert.match(workflow, /node scripts\/validate-pr-body\.mjs "\$PR_BODY_FILE"/);
  assert.doesNotMatch(workflow, /grep -Eiq 'Dashboard Butler'/);
  assert.doesNotMatch(workflow, /grep -Eiq 'primary\|主経路\|main path\|main route'/);
});

test("guarded workflow rejects draft implementation PRs instead of using draft as a hold", () => {
  const workflow = fs.readFileSync(".github/workflows/guarded-autonomy-required-checks.yml", "utf8");
  const agents = fs.readFileSync("AGENTS.md", "utf8");
  const customGptInstructions = fs.readFileSync("docs/setup/custom-gpt-instructions.md", "utf8");

  assert.match(workflow, /converted_to_draft/);
  assert.match(workflow, /ready_for_review/);
  assert.match(workflow, /name: Reject draft pull requests/);
  assert.match(workflow, /Draft PRs are disabled for VTDD implementation flow/);
  assert.match(workflow, /gh api "repos\/\$\{REPOSITORY\}\/pulls\/\$\{PULL_NUMBER\}" --jq '\.draft'/);
  assert.match(agents, /Do not create implementation PRs as Draft/);
  assert.match(agents, /do not convert implementation\s+PRs back to Draft as a holding pattern/);
  assert.match(agents, /`vtdd:hold` \/ `do-not-merge`/);
  assert.match(customGptInstructions, /Do not create implementation PRs as Draft/);
  assert.match(customGptInstructions, /do not convert implementation\s+PRs back to Draft to pause auto-merge/);
  assert.match(customGptInstructions, /`vtdd:hold` \//);
});

test("prepare-pr-body-file preserves a valid candidate body", async () => {
  const candidate = renderPrBody({
    issue: "57",
    intent: "Preserve valid candidate.",
    satisfied: "Body already matches the canonical contract.",
    unsatisfied: "Human review remains pending.",
    evidencePath: "docs/pr-template-model.md",
    ownerGoal: "Keep a valid PR body unchanged.",
    butlerEntrypoint: "PR body helper.",
    actionSchemaExposure: "No schema change.",
    runtimePath: "scripts/prepare-pr-body-file.mjs.",
    runtimeTruth: "Local validator pass.",
    authorityBoundary: "No high-risk operation.",
    butlerE2E: "Not required for this guardrail path.",
    completionStatus: "incomplete",
  });
  const prepared = prepareGuardedPullRequestBody({
    candidateBody: candidate,
    renderBody: () => "should not be used"
  });

  assert.equal(prepared.ok, true);
  assert.equal(prepared.normalized, false);
  assert.equal(prepared.body, candidate);
});

test("prepare-pr-body-file normalizes malformed candidate into canonical body file", async () => {
  const tmpdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "vtdd-pr-body-prepare-"));
  const file = path.join(tmpdir, "body.md");
  const prepared = await prepareGuardedPullRequestBodyFile({
    outputPath: file,
    candidateBody: "## Summary\n\nBroken.",
    renderBody: () =>
      renderPrBody({
        issue: "57",
        intent: "Normalize malformed candidate.",
        satisfied: "Canonical helper rewrites the body.",
        unsatisfied: "Human review remains pending.",
        evidencePath: "docs/pr-template-model.md",
        ownerGoal: "Avoid freehand PR body drift.",
        butlerEntrypoint: "PR body helper.",
        actionSchemaExposure: "No schema change.",
        runtimePath: "scripts/prepare-pr-body-file.mjs.",
        runtimeTruth: "Local validator pass.",
        authorityBoundary: "No high-risk operation.",
        butlerE2E: "Not required for this guardrail path.",
        completionStatus: "incomplete",
      })
  });

  assert.equal(prepared.ok, true);
  assert.equal(prepared.normalized, true);
  assert.equal((await fs.promises.readFile(file, "utf8")).includes("## This PR satisfies Intent"), true);
});
