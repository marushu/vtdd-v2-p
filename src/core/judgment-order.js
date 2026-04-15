export const JudgmentStep = Object.freeze({
  CONSTITUTION: "constitution",
  RUNTIME_TRUTH: "runtime_truth",
  ISSUE_CONTEXT: "issue_context",
  CURRENT_QUERY: "current_query"
});

const REQUIRED_ORDER = Object.freeze([
  JudgmentStep.CONSTITUTION,
  JudgmentStep.RUNTIME_TRUTH,
  JudgmentStep.ISSUE_CONTEXT,
  JudgmentStep.CURRENT_QUERY
]);

export function evaluateJudgmentOrder(steps) {
  const normalized = normalizeSteps(steps);
  if (normalized.length < REQUIRED_ORDER.length) {
    return deny("butler_invalid_judgment_order", "judgment trace is incomplete");
  }

  for (let index = 0; index < REQUIRED_ORDER.length; index += 1) {
    if (normalized[index] !== REQUIRED_ORDER[index]) {
      return deny(
        "butler_invalid_judgment_order",
        `judgment step ${index + 1} must be ${REQUIRED_ORDER[index]}`
      );
    }
  }

  return { ok: true, requiredOrder: REQUIRED_ORDER };
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps)) {
    return [];
  }
  return steps.map((item) =>
    String(item ?? "")
      .trim()
      .toLowerCase()
  );
}

function deny(rule, reason) {
  return { ok: false, rule, reason, requiredOrder: REQUIRED_ORDER };
}
