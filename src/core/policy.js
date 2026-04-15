import { evaluateApproval } from "./approval.js";
import { resolveRepositoryTarget } from "./repository-resolution.js";
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
    issueTraceable,
    go,
    passkey
  } = input;

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
