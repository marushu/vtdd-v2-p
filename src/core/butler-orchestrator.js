import { evaluateJudgmentOrder } from "./judgment-order.js";
import { evaluateExecutionPolicy } from "./policy.js";
import { evaluateSurfaceIndependence } from "./surface-independence.js";
import { ActorRole } from "./types.js";

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
    actorRole: ActorRole.BUTLER
  });
  if (!policy.allowed) {
    return {
      allowed: false,
      blockedByRule: policy.blockedByRule,
      reason: policy.reason
    };
  }

  return {
    allowed: true,
    repository: policy.repository,
    requiredApproval: policy.requiredApproval
  };
}

function deny(rule, reason) {
  return { allowed: false, blockedByRule: rule, reason };
}
