export const DeployAuthorityPath = Object.freeze({
  ONE_SHOT_GITHUB_ACTIONS: "one_shot_github_actions",
  DIRECT_PROVIDER: "direct_provider",
  DEFERRED_SSH: "deferred_ssh"
});

export const DeployAuthorityPreference = Object.freeze({
  AUTO: "auto",
  GITHUB_ASSISTED: "github_assisted",
  VTDD_MANAGED: "vtdd_managed"
});

export const ProtectionSignalStatus = Object.freeze({
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
  FORBIDDEN: "forbidden",
  UNKNOWN: "unknown"
});

export function evaluateDeployAuthorityStrategy(input = {}) {
  const repositoryVisibility = normalizeVisibility(input.repositoryVisibility);
  const branchProtection = normalizeSignalStatus(input.branchProtectionApiStatus);
  const rulesets = normalizeSignalStatus(input.rulesetsApiStatus);
  const operatorPreference = normalizePreference(input.operatorPreference);

  const protectionAvailable =
    branchProtection === ProtectionSignalStatus.AVAILABLE ||
    rulesets === ProtectionSignalStatus.AVAILABLE;
  const protectionBlocked =
    branchProtection === ProtectionSignalStatus.FORBIDDEN ||
    rulesets === ProtectionSignalStatus.FORBIDDEN;

  let selectedPath = DeployAuthorityPath.ONE_SHOT_GITHUB_ACTIONS;
  let rationale =
    "one-shot GitHub Actions is the first implementation candidate while removing permanent deploy authority from GitHub.";

  if (operatorPreference === DeployAuthorityPreference.VTDD_MANAGED) {
    selectedPath = DeployAuthorityPath.DIRECT_PROVIDER;
    rationale =
      "operator preference forces VTDD-managed deploy authority even if GitHub protection is available.";
  } else if (!protectionAvailable && protectionBlocked) {
    selectedPath = DeployAuthorityPath.DIRECT_PROVIDER;
    rationale =
      "GitHub protection APIs are unavailable or forbidden, so deploy authority must fall back to a provider-managed path.";
  }

  return {
    selectedPath,
    fallbackPath:
      selectedPath === DeployAuthorityPath.ONE_SHOT_GITHUB_ACTIONS
        ? DeployAuthorityPath.DIRECT_PROVIDER
        : DeployAuthorityPath.ONE_SHOT_GITHUB_ACTIONS,
    deferredPath: DeployAuthorityPath.DEFERRED_SSH,
    operatorPreference,
    protectionAvailability: {
      repositoryVisibility,
      branchProtectionApiStatus: branchProtection,
      rulesetsApiStatus: rulesets,
      protectionAvailable,
      protectionBlocked,
      prefersGitHubHardening:
        protectionAvailable && operatorPreference !== DeployAuthorityPreference.VTDD_MANAGED
    },
    relationshipToIssue37:
      selectedPath === DeployAuthorityPath.ONE_SHOT_GITHUB_ACTIONS
        ? "coexist_with_github_actions_mvp_path"
        : "degrade_from_github_actions_mvp_path_to_provider_managed_path",
    invariants: [
      "deploy_requires_go_passkey",
      "no_permanent_github_deploy_authority",
      "main_push_must_not_imply_production_deploy"
    ],
    rationale
  };
}

function normalizeSignalStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (Object.values(ProtectionSignalStatus).includes(normalized)) {
    return normalized;
  }
  return ProtectionSignalStatus.UNKNOWN;
}

function normalizePreference(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (Object.values(DeployAuthorityPreference).includes(normalized)) {
    return normalized;
  }
  return DeployAuthorityPreference.AUTO;
}

function normalizeVisibility(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "public" || normalized === "private") {
    return normalized;
  }
  return "unknown";
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
