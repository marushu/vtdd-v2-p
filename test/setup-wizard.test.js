import test from "node:test";
import assert from "node:assert/strict";
import { SetupOutputTarget, runInitialSetupWizard } from "../src/core/index.js";

const validAnswers = {
  repositories: [
    {
      canonicalRepo: "marushu/vtdd-v2",
      aliases: ["vtdd"]
    },
    {
      canonicalRepo: "marushu/hibou-piccola-bookkeeping",
      aliases: ["tomio", "bookkeeping"]
    }
  ],
  allowDefaultRepository: false,
  credentialModel: "github_app",
  highRiskApproval: "go_passkey",
  reviewerInitial: "gemini",
  initialSurfaces: ["custom_gpt"]
};

test("setup wizard returns git and db output targets", () => {
  const result = runInitialSetupWizard({ answers: validAnswers });
  assert.equal(result.ok, true);
  assert.equal(result.outputs.git.length > 0, true);
  assert.equal(result.outputs.db.length > 0, true);
  assert.equal(result.outputs.git[0].target, SetupOutputTarget.GIT);
  assert.equal(result.outputs.db[0].target, SetupOutputTarget.DB);
});

test("setup wizard blocks non github_app credential model", () => {
  const result = runInitialSetupWizard({
    answers: {
      ...validAnswers,
      credentialModel: "personal_access_token"
    }
  });
  assert.equal(result.ok, false);
  assert.equal(
    result.blockingIssues.includes("credential model must be github_app"),
    true
  );
});

test("setup wizard blocks default repository usage", () => {
  const result = runInitialSetupWizard({
    answers: {
      ...validAnswers,
      allowDefaultRepository: true
    }
  });
  assert.equal(result.ok, false);
  assert.equal(
    result.blockingIssues.includes("default repository is forbidden"),
    true
  );
});

test("setup wizard marks unsafe db output as blocked", () => {
  const result = runInitialSetupWizard({
    answers: {
      ...validAnswers,
      initialSurfaces: ["custom_gpt", "token=ghp_abcdefghijklmnopqrstuvwxyz1234"]
    }
  });
  assert.equal(result.ok, true);
  const blocked = result.outputs.db.find((item) => item.kind === "blocked");
  assert.equal(Boolean(blocked), true);
});
