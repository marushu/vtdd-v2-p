import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CONSTITUTION_RULE_DESCRIPTIONS,
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

test("default constitution schema uses canonical descriptions", () => {
  const schema = createDefaultConstitutionSchema();
  for (const rule of schema.rules) {
    assert.equal(rule.description, CONSTITUTION_RULE_DESCRIPTIONS[rule.id]);
  }
});

test("docs constitution schema lists the same required rule ids", () => {
  const docSchema = JSON.parse(
    readFileSync(new URL("../docs/constitution/schema.json", import.meta.url), "utf8")
  );
  assert.deepEqual(
    docSchema.$defs.ruleId.enum,
    REQUIRED_CONSTITUTION_RULE_IDS
  );
});
