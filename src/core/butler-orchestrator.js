import { evaluateJudgmentOrder } from "./judgment-order.js";
import { evaluateExecutionPolicy } from "./policy.js";
import { isBoundRemoteCodexHandoff } from "./remote-codex-handoff-scope.js";
import { evaluateSurfaceIndependence } from "./surface-independence.js";
import { ActionType, ActorRole, CredentialTier } from "./types.js";

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

  const remoteCodexHandoff = isRemoteCodexHandoff(input);
  const policyInput = {
    ...(input?.policyInput ?? {}),
    constitutionConsulted: true,
    credential:
      input?.policyInput?.credential ??
      (remoteCodexHandoff ? { model: "github_app", tier: CredentialTier.EXECUTE } : undefined),
    approvalScopeMatched:
      input?.policyInput?.approvalScopeMatched === true || remoteCodexHandoff
  };
  const policy = evaluateExecutionPolicy({
    ...policyInput,
    actorRole: resolveButlerPolicyActorRole({ ...input, remoteCodexHandoff })
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
    input?.remoteCodexHandoff === true
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

  return isBoundRemoteCodexHandoff(input);
}

function deny(rule, reason) {
  return { allowed: false, blockedByRule: rule, reason };
}
