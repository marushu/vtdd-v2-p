export const DEFAULT_EXECUTION_PREFLIGHT_REQUIRED_REPO_FILES = Object.freeze([
  "AGENTS.md",
  "docs/pr-template-model.md",
  "scripts/render-pr-body.mjs",
  "scripts/validate-pr-body.mjs"
]);

export const DEFAULT_EXECUTION_PREFLIGHT_POLICY = Object.freeze({
  mode: "auto_receipt",
  onMissingContract: "owner_decision_required",
  requiredRepoFiles: DEFAULT_EXECUTION_PREFLIGHT_REQUIRED_REPO_FILES
});

export function buildExecutionPreflightPolicy(overrides = {}) {
  const input = overrides && typeof overrides === "object" ? overrides : {};
  const requiredRepoFiles = normalizeStringList(input.requiredRepoFiles);
  return {
    mode: normalizeText(input.mode) || DEFAULT_EXECUTION_PREFLIGHT_POLICY.mode,
    onMissingContract:
      normalizeText(input.onMissingContract) || DEFAULT_EXECUTION_PREFLIGHT_POLICY.onMissingContract,
    requiredRepoFiles:
      requiredRepoFiles.length > 0
        ? requiredRepoFiles
        : [...DEFAULT_EXECUTION_PREFLIGHT_REQUIRED_REPO_FILES]
  };
}

function normalizeStringList(value) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return values.map(normalizeText).filter(Boolean);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}
