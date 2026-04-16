import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ISSUE_TRACEABILITY_FIELDS, evaluateIssueTraceability } from "../src/core/index.js";

const DOC_PATH = path.join(process.cwd(), "docs", "issue-as-spec-model.md");

test("issue-as-spec docs list canonical traceability fields", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");

  for (const field of ISSUE_TRACEABILITY_FIELDS) {
    assert.match(doc, new RegExp(`- \`${field}\``));
  }
});

test("execution requires at least one issue section reference", () => {
  const result = evaluateIssueTraceability({
    mode: "execution",
    traceability: {
      intentRefs: [],
      successCriteriaRefs: [],
      nonGoalRefs: []
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.rule, "require_traceability_to_issue_sections");
});

test("execution allows traceability to any canonical issue section", () => {
  const result = evaluateIssueTraceability({
    mode: "execution",
    traceability: {
      successCriteriaRefs: ["SC-1"]
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.traceability.successCriteriaRefs, ["SC-1"]);
});

test("out-of-scope changes are blocked unless proposal-only", () => {
  const blocked = evaluateIssueTraceability({
    mode: "execution",
    traceability: {
      intentRefs: ["I-1"],
      outOfScopeChanges: ["extra optimization"],
      outOfScopeProposedOnly: false
    }
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.rule, "no_out_of_scope_implementation");

  const allowed = evaluateIssueTraceability({
    mode: "execution",
    traceability: {
      intentRefs: ["I-1"],
      outOfScopeChanges: ["extra optimization"],
      outOfScopeProposedOnly: true
    }
  });
  assert.equal(allowed.ok, true);
});
