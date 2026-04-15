export const REQUIRED_CONSTITUTION_RULE_IDS = Object.freeze([
  "no_build_without_explicit_go",
  "runtime_truth_over_memory",
  "reconcile_when_runtime_conflicts_with_memory",
  "merge_requires_explicit_human_approval",
  "no_out_of_scope_implementation",
  "no_spec_inference_during_execution",
  "proposal_not_implementation_for_extra_ideas",
  "require_traceability_to_issue_sections",
  "butler_must_read_constitution_before_judgment"
]);

export function validateConstitutionSchema(input) {
  const schema = {
    version: normalizeText(input?.version),
    rules: Array.isArray(input?.rules) ? input.rules : []
  };

  const issues = [];
  if (!schema.version) {
    issues.push("version is required");
  }
  if (schema.rules.length === 0) {
    issues.push("rules must be a non-empty array");
  }

  const parsedRules = schema.rules.map(parseRule);
  parsedRules.forEach((rule, index) => {
    if (!rule.id) {
      issues.push(`rules[${index}].id is required`);
    }
    if (!rule.type) {
      issues.push(`rules[${index}].type is required`);
    }
    if (!rule.description) {
      issues.push(`rules[${index}].description is required`);
    }
    if (!rule.enforcementLevel) {
      issues.push(`rules[${index}].enforcementLevel is required`);
    }
  });

  const ids = new Set(parsedRules.map((rule) => rule.id).filter(Boolean));
  const missingRuleIds = REQUIRED_CONSTITUTION_RULE_IDS.filter((id) => !ids.has(id));
  if (missingRuleIds.length > 0) {
    issues.push(`missing required rules: ${missingRuleIds.join(", ")}`);
  }

  if (issues.length > 0) {
    return { ok: false, issues, missingRuleIds };
  }

  return {
    ok: true,
    schema: {
      version: schema.version,
      rules: parsedRules
    },
    missingRuleIds: []
  };
}

export function createDefaultConstitutionSchema() {
  return {
    version: "v2",
    rules: REQUIRED_CONSTITUTION_RULE_IDS.map((id) => ({
      id,
      type: "requirement",
      description: `Constitution rule: ${id}`,
      enforcementLevel: "must"
    }))
  };
}

function parseRule(input) {
  return {
    id: normalizeText(input?.id),
    type: normalizeText(input?.type),
    description: normalizeText(input?.description),
    enforcementLevel: normalizeText(input?.enforcementLevel)
  };
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}
