import { evaluateApproval } from "./approval.js";
import { resolveRepositoryTarget } from "./repository-resolution.js";
import { evaluateRuntimeTruthPrecondition } from "./runtime-truth.js";
import { TaskMode } from "./types.js";

/**
 * Deterministic MVP policy gate.
 * The caller should pass issueTraceable=true only when changes map to
 * Issue intent/success/non-goal boundaries.
 */
export function evaluateExecutionPolicy(input) {
  const {
    actionType,
    mode = TaskMode.EXECUTION,
    repositoryInput,
    aliasRegistry,
    constitutionConsulted = false,
    runtimeTruth = {},
    issueTraceable,
    go,
    passkey
  } = input;

  if (mode === TaskMode.EXECUTION && !constitutionConsulted) {
    return deny(
      "butler_must_read_constitution_before_judgment",
      "constitution must be consulted before execution judgment"
    );
  }

  const runtime = evaluateRuntimeTruthPrecondition({
    mode,
    ...runtimeTruth
  });
  if (!runtime.ok) {
    return deny(runtime.rule, runtime.reason, { reconcileRequired: runtime.reconcileRequired === true });
  }

  const repo = resolveRepositoryTarget({
    input: repositoryInput,
    mode,
    aliasRegistry
  });
  if (!repo.resolved && mode === TaskMode.EXECUTION) {
    return deny("unresolved_target_blocks_execution", repo.reason);
  }

  if (mode === TaskMode.EXECUTION && !issueTraceable) {
    return deny(
      "require_traceability_to_issue_sections",
      "execution requires traceability to issue intent/success/non-goal"
    );
  }

  const approval = evaluateApproval({ actionType, go, passkey });
  if (!approval.ok) {
    return deny("approval_boundary", approval.reason, { requiredApproval: approval.required });
  }

  return {
    allowed: true,
    repository: repo.resolved ? repo.repository : null,
    requiredApproval: approval.required
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
