import { evaluateApproval, evaluateConsent } from "./approval.js";
import { evaluateAutonomyModeBoundary } from "./autonomy-mode.js";
import { evaluateCredentialBoundary } from "./credential-boundary.js";
import { evaluateIssueTraceability } from "./issue-traceability.js";
import { resolveRepositoryTarget } from "./repository-resolution.js";
import { evaluateRoleBoundary } from "./role-boundary.js";
import { evaluateRuntimeTruthPrecondition } from "./runtime-truth.js";
import { AutonomyMode, TaskMode } from "./types.js";

/**
 * Deterministic MVP policy gate.
 * The caller should pass issueTraceable=true only when changes map to
 * Issue intent/success/non-goal boundaries.
 */
export function evaluateExecutionPolicy(input) {
  const {
    actionType,
    actorRole,
    mode = TaskMode.EXECUTION,
    repositoryInput,
    aliasRegistry,
    constitutionConsulted = false,
    runtimeTruth = {},
    credential,
    consent,
    approvalPhrase,
    approvalScopeMatched = false,
    issueTraceable,
    issueTraceability,
    autonomyMode = AutonomyMode.NORMAL,
    ambiguity,
    targetConfirmed = true,
    go,
    passkey
  } = input;

  const role = evaluateRoleBoundary({ actorRole, actionType });
  if (!role.ok) {
    return deny(role.rule, role.reason);
  }

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

  const traceability = evaluateIssueTraceability({
    mode,
    issueTraceable,
    traceability: issueTraceability
  });
  if (!traceability.ok) {
    return deny(traceability.rule, traceability.reason);
  }

  const autonomy = evaluateAutonomyModeBoundary({
    autonomyMode,
    mode,
    actionType,
    ambiguity,
    targetConfirmed,
    runtimeTruth
  });
  if (!autonomy.ok) {
    return deny(autonomy.rule, autonomy.reason, {
      autonomyMode: autonomy.autonomyMode,
      allowedActions: autonomy.allowedActions,
      issuePrCount: autonomy.issuePrCount
    });
  }

  const consentResult = evaluateConsent({ actionType, consent });
  if (!consentResult.ok) {
    return deny("consent_boundary", consentResult.reason, { requiredConsent: consentResult.required });
  }

  const approval = evaluateApproval({
    actionType,
    go,
    passkey,
    approvalPhrase,
    approvalScopeMatched
  });
  if (!approval.ok) {
    return deny("approval_boundary", approval.reason, { requiredApproval: approval.required });
  }

  if (mode === TaskMode.EXECUTION) {
    const credentialBoundary = evaluateCredentialBoundary({ actionType, credential });
    if (!credentialBoundary.ok) {
      return deny(credentialBoundary.rule, credentialBoundary.reason, {
        requiredCredentialTier: credentialBoundary.requiredTier
      });
    }
  }

  return {
    allowed: true,
    repository: repo.resolved ? repo.repository : null,
    requiredApproval: approval.required,
    autonomyMode: autonomy.autonomyMode
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
