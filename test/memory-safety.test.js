import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMemorySafety, inspectSensitiveContent, sanitizeMemoryPayload } from "../src/core/index.js";

test("allows decision log record without sensitive content", () => {
  const result = evaluateMemorySafety({
    recordType: "decision_log",
    content: {
      decision: "use github app credential model",
      rationale: "reduce blast radius by role segmentation"
    },
    metadata: { issue: 22 }
  });
  assert.equal(result.ok, true);
  assert.equal(result.storageTarget, "db");
});

test("blocks canonical spec from db memory", () => {
  const result = evaluateMemorySafety({
    recordType: "canonical_spec",
    content: "Issue as spec"
  });
  assert.equal(result.ok, false);
  assert.equal(result.rule, "canonical_spec_must_live_in_git");
});

test("blocks private key material", () => {
  const result = evaluateMemorySafety({
    recordType: "execution_log",
    content: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"
  });
  assert.equal(result.ok, false);
  assert.equal(result.rule, "memory_must_exclude_secrets");
});

test("blocks full casual chat transcript in working memory", () => {
  const result = evaluateMemorySafety({
    recordType: "working_memory",
    content: "some useful short summary",
    metadata: { fullCasualChat: true }
  });
  assert.equal(result.ok, false);
  assert.equal(result.rule, "no_full_casual_chat_history");
});

test("detects generic secret assignment", () => {
  const findings = inspectSensitiveContent("api_key=super-secret-value");
  assert.equal(findings.length > 0, true);
});

test("sanitizeMemoryPayload redacts sensitive values", () => {
  const sanitized = sanitizeMemoryPayload({
    content: "token: ghp_abcdefghijklmnopqrstuvwxyz1234",
    metadata: {
      nested: {
        key: "sk-abcdefghijklmnopqrstuvwxyz123456"
      }
    }
  });
  assert.equal(sanitized.content.includes("[REDACTED]"), true);
  assert.equal(String(sanitized.metadata.nested.key).includes("[REDACTED]"), true);
});
