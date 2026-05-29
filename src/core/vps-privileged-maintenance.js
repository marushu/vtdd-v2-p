const CAPABILITY_STATUSES = new Set(["enabled", "disabled"]);
const CAPABILITY_OPERATIONS = new Set(["add", "enable", "disable", "remove", "rollback", "review"]);
const RISK_LEVELS = new Set(["low", "medium", "high"]);
const DEFAULT_MANIFEST_VERSION = 1;

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
  return {
    actionType: "destructive",
    highRiskKind: "vps_runner_admin",
    repositoryInput: normalizeRepository(input.repository),
    relatedIssue: "637",
    phase: "execution",
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
  normalizeVpsCapability,
  normalizeVpsCapabilityManifest
};
