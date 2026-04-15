import { evaluateButlerExecution } from "./butler-orchestrator.js";
import { evaluateExecutionPolicy } from "./policy.js";
import { buildRetrievalPlan } from "./retrieval-contract.js";
import { evaluateMemorySafety, sanitizeMemoryPayload } from "./memory-safety.js";
import { createInitialWorkflowState, transitionWorkflow } from "./state-machine.js";
import { ActorRole, TaskMode } from "./types.js";

/**
 * End-to-end deterministic gateway for MVP operations.
 * It orchestrates:
 * - retrieval contract
 * - policy judgment
 * - workflow transition
 * - memory safety pre-check
 */
export function runMvpGateway(input) {
  const phase = normalizePhase(input?.phase);
  const retrievalPlan = buildRetrievalPlan({
    phase,
    includeProposal: true,
    includeConversation: phase === "exploration"
  });

  const actorRole = normalizeRole(input?.actorRole);
  const policyInput = {
    ...(input?.policyInput ?? {}),
    actorRole
  };

  const execution = evaluateExecution({ actorRole, input, policyInput });
  if (!execution.allowed) {
    return deny(execution.blockedByRule, execution.reason, { retrievalPlan });
  }

  const workflowDecision = evaluateWorkflowTransition(
    input?.currentWorkflowState,
    input?.workflowEvent
  );
  if (!workflowDecision.ok) {
    return deny(
      "workflow_transition_blocked",
      workflowDecision.reason,
      {
        retrievalPlan,
        workflowState: workflowDecision.state,
        allowedWorkflowEvents: workflowDecision.allowedEvents
      }
    );
  }

  const memoryPlan = prepareMemoryPlan(input?.memoryRecord);
  if (!memoryPlan.ok) {
    return deny(memoryPlan.rule, memoryPlan.reason, { retrievalPlan });
  }

  return {
    allowed: true,
    retrievalPlan,
    workflowState: workflowDecision.state,
    repository: execution.repository ?? null,
    requiredApproval: execution.requiredApproval ?? null,
    memoryWrite: memoryPlan.value
  };
}

function evaluateExecution({ actorRole, input, policyInput }) {
  if (actorRole === ActorRole.BUTLER && policyInput.mode !== TaskMode.READ_ONLY) {
    return evaluateButlerExecution({
      surfaceContext: input?.surfaceContext,
      judgmentTrace: input?.judgmentTrace,
      policyInput
    });
  }

  return evaluateExecutionPolicy(policyInput);
}

function evaluateWorkflowTransition(state, event) {
  if (!event) {
    return { ok: true, state: state ?? createInitialWorkflowState() };
  }
  const current = state ?? createInitialWorkflowState();
  const transitioned = transitionWorkflow(current, event);
  if (!transitioned.ok) {
    return {
      ok: false,
      reason: transitioned.reason,
      state: transitioned.state,
      allowedEvents: transitioned.allowedEvents
    };
  }
  return { ok: true, state: transitioned.state };
}

function prepareMemoryPlan(memoryRecord) {
  if (!memoryRecord) {
    return { ok: true, value: null };
  }
  const safety = evaluateMemorySafety(memoryRecord);
  if (!safety.ok) {
    return {
      ok: false,
      rule: safety.rule,
      reason: safety.reason
    };
  }
  const sanitized = sanitizeMemoryPayload(memoryRecord);
  return {
    ok: true,
    value: {
      recordType: safety.normalizedRecordType,
      storageTarget: safety.storageTarget,
      content: sanitized.content,
      metadata: sanitized.metadata
    }
  };
}

function deny(rule, reason, detail = {}) {
  return {
    allowed: false,
    blockedByRule: rule,
    reason,
    ...detail
  };
}

function normalizePhase(value) {
  const normalized = String(value ?? "execution")
    .trim()
    .toLowerCase();
  if (normalized === "execution" || normalized === "exploration") {
    return normalized;
  }
  return "execution";
}

function normalizeRole(value) {
  const normalized = String(value ?? ActorRole.EXECUTOR)
    .trim()
    .toLowerCase();
  if (Object.values(ActorRole).includes(normalized)) {
    return normalized;
  }
  return ActorRole.EXECUTOR;
}
