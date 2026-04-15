import test from "node:test";
import assert from "node:assert/strict";
import {
  REQUIRED_CONSTITUTION_RULE_IDS,
  createDefaultConstitutionSchema,
  validateConstitutionSchema
} from "../src/core/index.js";

test("default constitution schema includes all required rule ids", () => {
  const schema = createDefaultConstitutionSchema();
  const validated = validateConstitutionSchema(schema);
  assert.equal(validated.ok, true);
  assert.equal(validated.schema.rules.length, REQUIRED_CONSTITUTION_RULE_IDS.length);
});

test("constitution schema validation fails when required rule is missing", () => {
  const schema = createDefaultConstitutionSchema();
  schema.rules = schema.rules.filter(
    (rule) => rule.id !== "no_spec_inference_during_execution"
  );
  const validated = validateConstitutionSchema(schema);
  assert.equal(validated.ok, false);
  assert.equal(validated.missingRuleIds.includes("no_spec_inference_during_execution"), true);
});

test("constitution schema validation fails when fields are missing", () => {
  const validated = validateConstitutionSchema({
    version: "v2",
    rules: [{ id: "", type: "", description: "", enforcementLevel: "" }]
  });
  assert.equal(validated.ok, false);
  assert.equal(validated.issues.length > 0, true);
});
