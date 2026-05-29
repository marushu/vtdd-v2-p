const CAPABILITY_STATUSES = new Set(["enabled", "disabled"]);
const CAPABILITY_OPERATIONS = new Set(["add", "enable", "disable", "remove", "rollback", "review"]);
const RISK_LEVELS = new Set(["low", "medium", "high"]);
const DEFAULT_MANIFEST_VERSION = 1;
const HELPER_EXECUTION_MODES = new Set(["dry_run"]);
const HELPER_COMMAND_REGISTRY = defineHelperCommandRegistry([
  {
    commandClass: "playwright_install_deps_chromium",
    title: "Playwright Chromium dependency install",
    allowedArgs: ["npx playwright install-deps chromium"],
    argv: ["npx", "playwright", "install-deps", "chromium"],
    requiredRiskLevel: "high",
    requiresRoot: true,
    initialPreset: true
  },
  {
    commandClass: "codex_sandbox_sysctl_apply",
    title: "Codex sandbox sysctl apply",
    allowedArgs: ["sysctl --system"],
    argv: ["sysctl", "--system"],
    requiredRiskLevel: "high",
    requiresRoot: true,
    initialPreset: true
  },
  {
    commandClass: "systemd_user_runner_restart",
    title: "Restart VTDD runner user service",
    allowedArgs: ["systemctl --user restart vtdd-vps-runner.timer"],
    argv: ["systemctl", "--user", "restart", "vtdd-vps-runner.timer"],
    requiredRiskLevel: "medium",
    requiresRoot: false,
    initialPreset: true
  }
]);

function normalizeVpsCapabilityManifest(input = {}) {
  const issues = [];
  const manifest = {
    version: normalizePositiveInteger(input.version, DEFAULT_MANIFEST_VERSION),
    host: normalizeText(input.host),
    repository: normalizeRepository(input.repository),
    updatedAt: normalizeText(input.updatedAt),
    capabilities: []
  };

  const seen = new Set();
  for (const rawCapability of Array.isArray(input.capabilities) ? input.capabilities : []) {
    const normalized = normalizeVpsCapability(rawCapability);
    if (!normalized.ok) {
      issues.push(...normalized.issues);
      continue;
    }
    if (seen.has(normalized.capability.id)) {
      issues.push(`duplicate capability id: ${normalized.capability.id}`);
      continue;
    }
    seen.add(normalized.capability.id);
    manifest.capabilities.push(normalized.capability);
  }

  if (!manifest.host) {
    issues.push("manifest host is required");
  }
  if (!manifest.repository) {
    issues.push("manifest repository is required");
  }

  return {
    ok: issues.length === 0,
    manifest,
    issues
  };
}

function normalizeVpsCapability(input = {}) {
  const issues = [];
  const capability = {
    id: normalizeCapabilityId(input.id || input.capabilityId),
    title: normalizeText(input.title),
    status: normalizeCapabilityStatus(input.status),
    commandClass: normalizeText(input.commandClass),
    riskLevel: normalizeRiskLevel(input.riskLevel),
    workingDirectories: normalizeStringList(input.workingDirectories || input.working_dirs),
    allowedArgs: normalizeStringList(input.allowedArgs || input.allowed_args),
    affectedPaths: normalizeStringList(input.affectedPaths || input.affected_paths),
    redactionRules: normalizeStringList(input.redactionRules || input.redaction_rules),
    rollbackPlan: normalizeText(input.rollbackPlan || input.rollback_plan),
    expectedRuntimeTruth: normalizeStringList(input.expectedRuntimeTruth || input.expected_runtime_truth),
    createdAt: normalizeText(input.createdAt),
    updatedAt: normalizeText(input.updatedAt)
  };

  if (!capability.id) issues.push("capability id is required");
  if (!capability.title) issues.push(`capability ${capability.id || "(unknown)"} title is required`);
  if (!capability.commandClass) issues.push(`capability ${capability.id || "(unknown)"} commandClass is required`);
  if (capability.workingDirectories.length === 0) {
    issues.push(`capability ${capability.id || "(unknown)"} requires at least one working directory`);
  }
  if (capability.allowedArgs.length === 0) {
    issues.push(`capability ${capability.id || "(unknown)"} requires allowedArgs`);
  }
  if (!capability.rollbackPlan) {
    issues.push(`capability ${capability.id || "(unknown)"} rollbackPlan is required`);
  }
  if (containsForbiddenPrivilegedPattern(capability)) {
    issues.push(`capability ${capability.id || "(unknown)"} contains forbidden broad privileged pattern`);
  }

  return {
    ok: issues.length === 0,
    capability,
    issues
  };
}

function buildVpsCapabilityProposal(input = {}) {
  const capability = normalizeVpsCapability({
    ...input,
    status: input.status || "disabled"
  });
  const issues = [...capability.issues];
  const proposal = {
    kind: "vps_privileged_maintenance_capability_proposal",
    capability: capability.capability,
    reason: normalizeText(input.reason),
    host: normalizeText(input.host),
    repository: normalizeRepository(input.repository),
    requestedBy: normalizeText(input.requestedBy || input.requested_by),
    approvalRequired: true,
    pwaNotificationRequired: true
  };

  if (!proposal.reason) issues.push("proposal reason is required");
  if (!proposal.host) issues.push("proposal host is required");
  if (!proposal.repository) issues.push("proposal repository is required");

  return {
    ok: issues.length === 0,
    proposal,
    issues
  };
}

function applyVpsCapabilityLifecycleOperation(input = {}) {
  const operation = normalizeText(input.operation);
  const manifestResult = normalizeVpsCapabilityManifest(input.manifest);
  const now = normalizeText(input.now) || new Date().toISOString();
  const issues = [...manifestResult.issues];
  if (!CAPABILITY_OPERATIONS.has(operation)) {
    issues.push("operation must be add, enable, disable, remove, rollback, or review");
  }
  if (issues.length > 0) {
    return { ok: false, error: "vps_capability_lifecycle_invalid", issues };
  }

  const manifest = cloneManifest(manifestResult.manifest);
  if (operation === "review") {
    return {
      ok: true,
      manifest,
      review: buildVpsCapabilityReview(manifest)
    };
  }

  const capabilityId = normalizeCapabilityId(input.capabilityId || input.capability_id || input.proposal?.capability?.id);
  const index = manifest.capabilities.findIndex((capability) => capability.id === capabilityId);
  const before = index >= 0 ? { ...manifest.capabilities[index] } : null;

  if (operation === "add") {
    if (index >= 0) {
      return { ok: false, error: "vps_capability_already_exists", issues: [`capability already exists: ${capabilityId}`] };
    }
    const proposal = input.proposal?.kind ? input.proposal : buildVpsCapabilityProposal(input.proposal || {}).proposal;
    const normalized = normalizeVpsCapability({
      ...proposal.capability,
      status: "enabled",
      createdAt: proposal.capability?.createdAt || now,
      updatedAt: now
    });
    if (!normalized.ok) {
      return { ok: false, error: "vps_capability_invalid", issues: normalized.issues };
    }
    manifest.capabilities.push(normalized.capability);
  } else if (operation === "enable" || operation === "disable") {
    if (index < 0) {
      return { ok: false, error: "vps_capability_not_found", issues: [`capability not found: ${capabilityId}`] };
    }
    manifest.capabilities[index] = {
      ...manifest.capabilities[index],
      status: operation === "enable" ? "enabled" : "disabled",
      updatedAt: now
    };
  } else if (operation === "remove") {
    if (index < 0) {
      return { ok: false, error: "vps_capability_not_found", issues: [`capability not found: ${capabilityId}`] };
    }
    manifest.capabilities.splice(index, 1);
  } else if (operation === "rollback") {
    const previous = normalizeVpsCapabilityManifest(input.previousManifest || input.previous_manifest);
    if (!previous.ok) {
      return { ok: false, error: "vps_capability_rollback_invalid", issues: previous.issues };
    }
    return {
      ok: true,
      manifest: {
        ...previous.manifest,
        updatedAt: now
      },
      runtimeTruth: buildRuntimeTruth({ operation, capabilityId, before: manifest, after: previous.manifest, now })
    };
  }

  manifest.updatedAt = now;
  const after = manifest.capabilities.find((capability) => capability.id === capabilityId) || null;
  return {
    ok: true,
    manifest,
    runtimeTruth: buildRuntimeTruth({ operation, capabilityId, before, after, now })
  };
}

function buildVpsMaintenanceApprovalScope(input = {}) {
  const capabilityId = normalizeCapabilityId(input.capabilityId || input.capability_id);
  const operation = normalizeText(input.operation);
  const relatedIssue = normalizePositiveInteger(input.relatedIssue || input.related_issue || input.issueNumber);
  return {
    actionType: "destructive",
    highRiskKind: "vps_runner_admin",
    repositoryInput: normalizeRepository(input.repository),
    issueNumber: relatedIssue ? String(relatedIssue) : "",
    relatedIssue: relatedIssue ? String(relatedIssue) : "",
    phase: "execution",
    vpsHost: normalizeText(input.host),
    vpsOperation: operation,
    vpsCapabilityId: capabilityId,
    vpsImpactScope: normalizeText(input.impactScope || input.impact_scope),
    vpsExpiresAt: normalizeText(input.expiresAt || input.expires_at),
    display: {
      host: normalizeText(input.host),
      operation,
      capabilityId,
      impactScope: normalizeText(input.impactScope || input.impact_scope),
      expiresAt: normalizeText(input.expiresAt || input.expires_at)
    }
  };
}

function buildVpsCapabilityReview(manifest) {
  return {
    host: manifest.host,
    repository: manifest.repository,
    version: manifest.version,
    activeCapabilities: manifest.capabilities.filter((capability) => capability.status === "enabled").map((capability) => capability.id),
    disabledCapabilities: manifest.capabilities.filter((capability) => capability.status === "disabled").map((capability) => capability.id),
    highRiskCapabilities: manifest.capabilities.filter((capability) => capability.riskLevel === "high").map((capability) => capability.id)
  };
}

function planVpsPrivilegedMaintenanceHelperExecution(input = {}) {
  const mode = normalizeText(input.mode || input.executionMode || input.execution_mode) || "dry_run";
  const manifestResult = normalizeVpsCapabilityManifest(input.manifest);
  const helperRequest = normalizeHelperRequest(input.helperRequest || input.helper_request);
  const now = normalizeText(input.now) || new Date().toISOString();
  const issues = [...manifestResult.issues, ...helperRequest.issues];
  if (!HELPER_EXECUTION_MODES.has(mode)) {
    issues.push("helper execution mode must be dry_run");
  }
  if (issues.length > 0) {
    return {
      ok: false,
      error: "vps_helper_request_invalid",
      issues
    };
  }

  const manifest = manifestResult.manifest;
  const request = helperRequest.request;
  const capability = manifest.capabilities.find((item) => item.id === request.capability.id);
  if (!capability) {
    return {
      ok: false,
      error: "vps_helper_capability_not_found",
      issues: [`capability not found: ${request.capability.id}`]
    };
  }
  if (capability.status !== "enabled") {
    return {
      ok: false,
      error: "vps_helper_capability_disabled",
      issues: [`capability is not enabled: ${request.capability.id}`]
    };
  }
  const mismatch = compareHelperRequestToCapability({ request, capability, manifest });
  if (mismatch.length > 0) {
    return {
      ok: false,
      error: "vps_helper_request_manifest_mismatch",
      issues: mismatch
    };
  }
  const registryBinding = bindHelperCommandRegistry(capability);
  if (!registryBinding.ok) {
    return {
      ok: false,
      error: registryBinding.error,
      issues: registryBinding.issues
    };
  }

  return {
    ok: true,
    helperPlan: {
      kind: "vps_privileged_maintenance_helper_plan",
      mode,
      status: "dry_run_ready",
      requestId: request.requestId,
      host: request.host,
      repository: request.repository,
      relatedIssue: request.relatedIssue,
      operation: request.operation,
      capability: sanitizeHelperCapability(capability),
      commandPreview: {
        commandClass: capability.commandClass,
        workingDirectories: capability.workingDirectories,
        allowedArgs: capability.allowedArgs,
        argv: registryBinding.binding.argv,
        registryBinding: registryBinding.binding
      },
      audit: {
        redactionRules: capability.redactionRules,
        expectedRuntimeTruth: capability.expectedRuntimeTruth,
        rollbackPlan: capability.rollbackPlan
      },
      rootExecutionStarted: false,
      helperExecutionStarted: false,
      redacted: true,
      plannedAt: now
    },
    runtimeTruth: {
      ok: true,
      kind: "vps_privileged_maintenance_helper_dry_run",
      status: "dry_run_ready",
      host: request.host,
      repository: request.repository,
      relatedIssue: request.relatedIssue,
      operation: request.operation,
      capabilityId: capability.id,
      commandClass: capability.commandClass,
      commandArgv: registryBinding.binding.argv,
      registryBinding: registryBinding.binding,
      before: {
        manifestVersion: manifest.version,
        capabilityStatus: capability.status
      },
      after: null,
      exitCode: null,
      redactedLogSummary: "dry-run only; privileged command was not executed",
      rootExecutionStarted: false,
      helperExecutionStarted: false,
      redacted: true,
      updatedAt: now
    }
  };
}

function buildRuntimeTruth({ operation, capabilityId, before, after, now }) {
  return {
    ok: true,
    kind: "vps_privileged_maintenance_capability_lifecycle",
    operation,
    capabilityId,
    before,
    after,
    updatedAt: now,
    redacted: true,
    pwaNotificationRequired: ["add", "enable", "disable", "remove", "rollback"].includes(operation)
  };
}

function containsForbiddenPrivilegedPattern(capability) {
  const joined = [
    capability.commandClass,
    ...capability.allowedArgs,
    ...capability.workingDirectories,
    capability.rollbackPlan
  ].join(" ");
  return /\bNOPASSWD\s*:\s*ALL\b/i.test(joined) || /\bsudo\s+su\b/i.test(joined) || /\b(root\s+shell|\/bin\/bash|\/bin\/sh)\b/i.test(joined);
}

function listVpsPrivilegedMaintenanceCommandRegistry() {
  return Object.values(HELPER_COMMAND_REGISTRY).map(cloneHelperCommandRegistryEntry);
}

function bindHelperCommandRegistry(capability) {
  const entry = HELPER_COMMAND_REGISTRY[capability.commandClass];
  if (!entry) {
    return {
      ok: false,
      error: "vps_helper_command_class_not_registered",
      issues: [`commandClass is not registered for VPS helper execution: ${capability.commandClass}`]
    };
  }
  const issues = [];
  if (!sameStringList(capability.allowedArgs, entry.allowedArgs)) {
    issues.push("capability allowedArgs must match registered helper command");
  }
  if (capability.riskLevel !== entry.requiredRiskLevel) {
    issues.push("capability riskLevel must match registered helper command");
  }
  if (issues.length > 0) {
    return {
      ok: false,
      error: "vps_helper_command_registry_mismatch",
      issues
    };
  }
  return {
    ok: true,
    binding: cloneHelperCommandRegistryEntry(entry)
  };
}

function defineHelperCommandRegistry(entries) {
  const registry = {};
  for (const entry of entries) {
    const normalized = {
      ...entry,
      allowedArgs: Object.freeze(normalizeStringList(entry.allowedArgs)),
      argv: Object.freeze(normalizeStringList(entry.argv))
    };
    registry[normalized.commandClass] = Object.freeze(normalized);
  }
  return Object.freeze(registry);
}

function cloneHelperCommandRegistryEntry(entry) {
  return {
    commandClass: entry.commandClass,
    title: entry.title,
    allowedArgs: [...entry.allowedArgs],
    argv: [...entry.argv],
    requiredRiskLevel: entry.requiredRiskLevel,
    requiresRoot: entry.requiresRoot,
    initialPreset: entry.initialPreset
  };
}

function normalizeHelperRequest(input = {}) {
  const capability = normalizeVpsCapability(input.capability || {});
  const issues = [...capability.issues];
  const request = {
    kind: normalizeText(input.kind),
    status: normalizeText(input.status),
    requestId: normalizeText(input.requestId || input.request_id),
    vpsProposalId: normalizeText(input.vpsProposalId || input.vps_proposal_id),
    approvalGrantId: normalizeText(input.approvalGrantId || input.approval_grant_id),
    host: normalizeText(input.host),
    repository: normalizeRepository(input.repository),
    relatedIssue: normalizePositiveInteger(input.relatedIssue || input.related_issue || input.issueNumber),
    operation: normalizeText(input.operation),
    capability: capability.capability
  };

  if (request.kind !== "vps_privileged_maintenance_helper_request") {
    issues.push("helperRequest kind must be vps_privileged_maintenance_helper_request");
  }
  if (request.status !== "ready_for_vps_helper") {
    issues.push("helperRequest status must be ready_for_vps_helper");
  }
  if (!request.requestId) issues.push("helperRequest requestId is required");
  if (!request.vpsProposalId) issues.push("helperRequest vpsProposalId is required");
  if (!request.approvalGrantId) issues.push("helperRequest approvalGrantId is required");
  if (!request.host) issues.push("helperRequest host is required");
  if (!request.repository) issues.push("helperRequest repository is required");
  if (!request.relatedIssue) issues.push("helperRequest relatedIssue is required");
  if (!CAPABILITY_OPERATIONS.has(request.operation)) {
    issues.push("helperRequest operation must be add, enable, disable, remove, rollback, or review");
  }

  return {
    ok: issues.length === 0,
    request,
    issues
  };
}

function compareHelperRequestToCapability({ request, capability, manifest }) {
  const issues = [];
  if (request.host !== manifest.host) issues.push("helperRequest host must match manifest host");
  if (request.repository !== manifest.repository) issues.push("helperRequest repository must match manifest repository");
  if (request.capability.commandClass !== capability.commandClass) {
    issues.push("helperRequest capability.commandClass must match manifest capability");
  }
  if (!sameStringList(request.capability.workingDirectories, capability.workingDirectories)) {
    issues.push("helperRequest capability.workingDirectories must match manifest capability");
  }
  if (!sameStringList(request.capability.allowedArgs, capability.allowedArgs)) {
    issues.push("helperRequest capability.allowedArgs must match manifest capability");
  }
  return issues;
}

function sanitizeHelperCapability(capability) {
  return {
    id: capability.id,
    title: capability.title,
    status: capability.status,
    commandClass: capability.commandClass,
    riskLevel: capability.riskLevel,
    workingDirectories: capability.workingDirectories,
    allowedArgs: capability.allowedArgs,
    affectedPaths: capability.affectedPaths,
    redactionRules: capability.redactionRules,
    rollbackPlan: capability.rollbackPlan,
    expectedRuntimeTruth: capability.expectedRuntimeTruth
  };
}

function sameStringList(left, right) {
  return JSON.stringify(normalizeStringList(left)) === JSON.stringify(normalizeStringList(right));
}

function cloneManifest(manifest) {
  return {
    ...manifest,
    capabilities: manifest.capabilities.map((capability) => ({ ...capability }))
  };
}

function normalizeCapabilityId(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeCapabilityStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  return CAPABILITY_STATUSES.has(normalized) ? normalized : "disabled";
}

function normalizeRiskLevel(value) {
  const normalized = normalizeText(value).toLowerCase();
  return RISK_LEVELS.has(normalized) ? normalized : "medium";
}

function normalizeStringList(value) {
  return (Array.isArray(value) ? value : [value])
    .map(normalizeText)
    .filter(Boolean);
}

function normalizePositiveInteger(value, fallback) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeRepository(value) {
  const normalized = normalizeText(value);
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalized) ? normalized : "";
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

export {
  buildVpsCapabilityProposal,
  buildVpsCapabilityReview,
  buildVpsMaintenanceApprovalScope,
  applyVpsCapabilityLifecycleOperation,
  planVpsPrivilegedMaintenanceHelperExecution,
  listVpsPrivilegedMaintenanceCommandRegistry,
  normalizeVpsCapability,
  normalizeVpsCapabilityManifest
};
