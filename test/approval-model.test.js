import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  APPROVAL_REQUIREMENTS,
  ActionType,
  ApprovalLevel,
  CONSENT_REQUIREMENT_MAP,
  ConsentCategory
} from "../src/core/index.js";

test("consent requirement map matches expected action categories", () => {
  assert.equal(CONSENT_REQUIREMENT_MAP[ActionType.READ], ConsentCategory.READ);
  assert.equal(CONSENT_REQUIREMENT_MAP[ActionType.ISSUE_CREATE], ConsentCategory.PROPOSE);
  assert.equal(CONSENT_REQUIREMENT_MAP[ActionType.BUILD], ConsentCategory.EXECUTE);
  assert.equal(CONSENT_REQUIREMENT_MAP[ActionType.DESTRUCTIVE], ConsentCategory.DESTRUCTIVE);
  assert.equal(
    CONSENT_REQUIREMENT_MAP[ActionType.EXTERNAL_PUBLISH],
    ConsentCategory.EXTERNAL_PUBLISH
  );
});

test("approval requirements map matches expected action levels", () => {
  assert.equal(APPROVAL_REQUIREMENTS[ActionType.READ], ApprovalLevel.NONE);
  assert.equal(APPROVAL_REQUIREMENTS[ActionType.BUILD], ApprovalLevel.GO);
  assert.equal(APPROVAL_REQUIREMENTS[ActionType.PR_REVIEW_SUBMIT], ApprovalLevel.GO);
  assert.equal(APPROVAL_REQUIREMENTS[ActionType.MERGE], ApprovalLevel.GO);
  assert.equal(APPROVAL_REQUIREMENTS[ActionType.DESTRUCTIVE], ApprovalLevel.GO_PASSKEY);
});

test("consent and approval docs contain canonical categories and levels", () => {
  const doc = readFileSync(
    new URL("../docs/security/consent-approval-model.md", import.meta.url),
    "utf8"
  );

  for (const category of Object.values(ConsentCategory)) {
    assert.equal(doc.includes(`\`${category}\``), true);
  }

  for (const level of Object.values(ApprovalLevel)) {
    assert.equal(doc.includes(`\`${level}\``), true);
  }

  assert.equal(doc.includes("`destructive` is the highest-risk consent category."), true);
  assert.equal(doc.includes("Approval must be bound to the target scope."), true);
  assert.equal(doc.includes("`approvalPhrase` is required"), true);
});
