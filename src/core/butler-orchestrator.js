import { evaluateJudgmentOrder } from "./judgment-order.js";
import { evaluateExecutionPolicy } from "./policy.js";
import { evaluateSurfaceIndependence } from "./surface-independence.js";
import { ActionType, ActorRole } from "./types.js";

/**
 * Unified Butler entrypoint for execution judgments.
 * This keeps the order:
 * 1) Surface independence
 * 2) Butler judgment order
 * 3) Execution policy gate
 */
export function evaluateButlerExecution(input) {
  const surface = evaluateSurfaceIndependence(input?.surfaceContext);
  if (!surface.ok) {
    return deny(surface.rule, surface.reason);
  }

  const judgment = evaluateJudgmentOrder(input?.judgmentTrace);
  if (!judgment.ok) {
    return deny(judgment.rule, judgment.reason);
  }

  const policy = evaluateExecutionPolicy({
    ...(input?.policyInput ?? {}),
    actorRole: resolveButlerPolicyActorRole(input)
  });
  if (!policy.allowed) {
    return { ...policy };
  }

  return {
    allowed: true,
    repository: policy.repository,
    requiredApproval: policy.requiredApproval,
    autonomyMode: policy.autonomyMode ?? null
  };
}

function resolveButlerPolicyActorRole(input) {
  const policyInput = input?.policyInput ?? {};
  if (
    policyInput.actionType === ActionType.BUILD &&
    isRemoteCodexHandoff(input)
  ) {
    return ActorRole.EXECUTOR;
  }

  return ActorRole.BUTLER;
}

function isRemoteCodexHandoff(input) {
  const runtimeContext = input?.runtimeContext ?? {};
  if (runtimeContext.allowButlerRemoteCodexHandoff !== true) {
    return false;
  }

  const context =
    input?.continuationContext && typeof input.continuationContext === "object"
      ? input.continuationContext
      : {};
  const handoff = context.handoff && typeof context.handoff === "object" ? context.handoff : {};
  const issueNumber = normalizePositiveInteger(input?.issueContext?.issueNumber);
  const relatedIssue = normalizePositiveInteger(handoff.relatedIssue);
  return (
    context.requiresHandoff === true &&
    handoff.issueTraceable === true &&
    handoff.approvalScopeMatched === true &&
    Boolean(normalizeText(handoff.summary)) &&
    issueNumber !== null &&
    relatedIssue === issueNumber &&
    hasBoundIssueTraceability(input, issueNumber)
  );
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasBoundIssueTraceability(input, issueNumber) {
  const traceability =
    input?.policyInput?.issueTraceability && typeof input.policyInput.issueTraceability === "object"
      ? input.policyInput.issueTraceability
      : {};
  const relatedIssue = normalizePositiveInteger(traceability.relatedIssue);
  return (
    relatedIssue === issueNumber &&
    hasTextArray(traceability.intentRefs) &&
    hasTextArray(traceability.successCriteriaRefs) &&
    hasTextArray(traceability.nonGoalRefs)
  );
}

function hasTextArray(value) {
  return Array.isArray(value) && value.some((item) => Boolean(normalizeText(item)));
}

function deny(rule, reason) {
  return { allowed: false, blockedByRule: rule, reason };
}
