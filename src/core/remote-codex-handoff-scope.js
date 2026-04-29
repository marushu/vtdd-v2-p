export function isBoundRemoteCodexHandoff(input = {}) {
  const context = normalizeObject(input?.continuationContext);
  const handoff = normalizeObject(context.handoff);
  const issueContext = normalizeObject(input?.issueContext);
  const issueNumber = normalizePositiveInteger(issueContext.issueNumber);
  const relatedIssue = normalizePositiveInteger(handoff.relatedIssue);

  return (
    context.requiresHandoff === true &&
    handoff.issueTraceable === true &&
    handoff.approvalScopeMatched === true &&
    Boolean(normalizeText(handoff.summary)) &&
    issueNumber !== null &&
    relatedIssue === issueNumber &&
    hasBoundIssueTraceability(input?.policyInput, issueNumber)
  );
}

function hasBoundIssueTraceability(policyInput, issueNumber) {
  const traceability = normalizeObject(policyInput?.issueTraceability);
  return (
    normalizePositiveInteger(traceability.relatedIssue) === issueNumber &&
    hasTextArray(traceability.intentRefs) &&
    hasTextArray(traceability.successCriteriaRefs) &&
    hasTextArray(traceability.nonGoalRefs)
  );
}

function hasTextArray(value) {
  return Array.isArray(value) && value.some((item) => Boolean(normalizeText(item)));
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
