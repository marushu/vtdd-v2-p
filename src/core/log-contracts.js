export function createDecisionLogEntry(input) {
  const candidate = {
    decision: normalizeText(input?.decision),
    rationale: normalizeText(input?.rationale),
    relatedIssue: normalizeIssue(input?.relatedIssue),
    decidedBy: normalizeText(input?.decidedBy),
    timestamp: normalizeTimestamp(input?.timestamp),
    supersededBy: input?.supersededBy ? normalizeText(input?.supersededBy) : null
  };

  const validation = validateDecisionLogEntry(candidate);
  if (!validation.ok) {
    return validation;
  }
  return { ok: true, entry: candidate };
}

export function validateDecisionLogEntry(entry) {
  const issues = [];
  if (!entry?.decision) {
    issues.push("decision is required");
  }
  if (!entry?.rationale) {
    issues.push("rationale is required");
  }
  if (!Number.isInteger(entry?.relatedIssue) || entry.relatedIssue <= 0) {
    issues.push("relatedIssue must be a positive integer");
  }
  if (!entry?.decidedBy) {
    issues.push("decidedBy is required");
  }
  if (!isIsoTimestamp(entry?.timestamp)) {
    issues.push("timestamp must be ISO-8601");
  }
  if (entry?.supersededBy !== null && entry?.supersededBy !== undefined && !entry?.supersededBy) {
    issues.push("supersededBy must be non-empty when present");
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true };
}

export function createProposalLogEntry(input) {
  const candidate = {
    hypothesis: normalizeText(input?.hypothesis),
    options: normalizeStringArray(input?.options),
    rejectedReasons: normalizeRejectedReasons(input?.rejectedReasons),
    concerns: normalizeStringArray(input?.concerns),
    unresolvedQuestions: normalizeStringArray(input?.unresolvedQuestions),
    relatedIssue: input?.relatedIssue ? normalizeIssue(input?.relatedIssue) : null,
    proposedBy: normalizeText(input?.proposedBy),
    timestamp: normalizeTimestamp(input?.timestamp)
  };

  const validation = validateProposalLogEntry(candidate);
  if (!validation.ok) {
    return validation;
  }
  return { ok: true, entry: candidate };
}

export function validateProposalLogEntry(entry) {
  const issues = [];
  if (!entry?.hypothesis) {
    issues.push("hypothesis is required");
  }
  if (!Array.isArray(entry?.options) || entry.options.length === 0) {
    issues.push("options must be a non-empty array");
  }
  if (!entry?.proposedBy) {
    issues.push("proposedBy is required");
  }
  if (!isIsoTimestamp(entry?.timestamp)) {
    issues.push("timestamp must be ISO-8601");
  }
  if (entry?.relatedIssue !== null && entry?.relatedIssue !== undefined) {
    if (!Number.isInteger(entry.relatedIssue) || entry.relatedIssue <= 0) {
      issues.push("relatedIssue must be a positive integer when present");
    }
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true };
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

function normalizeTimestamp(value) {
  if (!value) {
    return new Date().toISOString();
  }
  const iso = String(value).trim();
  return iso;
}

function normalizeIssue(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : -1;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function normalizeRejectedReasons(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => ({
      option: normalizeText(item?.option),
      reason: normalizeText(item?.reason)
    }))
    .filter((item) => item.option && item.reason);
}

function isIsoTimestamp(value) {
  const ts = String(value ?? "").trim();
  if (!ts) {
    return false;
  }
  const parsed = Date.parse(ts);
  return Number.isFinite(parsed) && ts.includes("T");
}
