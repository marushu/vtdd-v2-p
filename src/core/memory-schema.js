export const MemoryRecordType = Object.freeze({
  CONSTITUTION: "constitution",
  DECISION_LOG: "decision_log",
  WORKING_MEMORY: "working_memory",
  TEMPERATURE_NOTE: "temperature_note",
  REPAIR_CASE: "repair_case",
  PROPOSAL_LOG: "proposal_log",
  APPROVAL_LOG: "approval_log",
  EXECUTION_LOG: "execution_log",
  ALIAS_REGISTRY: "alias_registry"
});

export const REQUIRED_CORE_MEMORY_RECORD_TYPES = Object.freeze([
  MemoryRecordType.CONSTITUTION,
  MemoryRecordType.DECISION_LOG,
  MemoryRecordType.WORKING_MEMORY,
  MemoryRecordType.TEMPERATURE_NOTE,
  MemoryRecordType.REPAIR_CASE
]);

export const MEMORY_RECORD_FIELD_POLICY = Object.freeze({
  metadata: "required_object_without_secrets",
  priority: "integer_0_to_100",
  tags: "string_array",
  createdAt: "iso_8601_timestamp"
});

export const MEMORY_CHECKPOINT_CONTEXT_SOURCE_QUALITY = Object.freeze([
  "full_thread_context",
  "compressed_context",
  "external_evidence",
  "missing_context_risk"
]);

export const EXPLORATION_HYPOTHESIS_STATUS = Object.freeze([
  "open",
  "confirmed",
  "rejected",
  "superseded",
  "unknown"
]);

export function createMemoryRecord(input) {
  const record = {
    id: normalizeText(input?.id),
    type: normalizeText(input?.type),
    content: input?.content ?? null,
    metadata: normalizeObject(input?.metadata),
    priority: normalizePriority(input?.priority),
    tags: normalizeTags(input?.tags),
    createdAt: normalizeTimestamp(input?.createdAt)
  };

  const validation = validateMemoryRecord(record);
  if (!validation.ok) {
    return validation;
  }
  return { ok: true, record };
}

export function validateMemoryRecord(record) {
  const issues = [];
  if (!record?.id) {
    issues.push("id is required");
  }
  if (!Object.values(MemoryRecordType).includes(record?.type)) {
    issues.push("type is invalid");
  }
  if (record?.content === null || record?.content === undefined) {
    issues.push("content is required");
  }
  if (!record?.metadata || typeof record.metadata !== "object" || Array.isArray(record.metadata)) {
    issues.push("metadata must be an object");
  }
  if (!Number.isInteger(record?.priority) || record.priority < 0 || record.priority > 100) {
    issues.push("priority must be an integer between 0 and 100");
  }
  if (!Array.isArray(record?.tags)) {
    issues.push("tags must be an array");
  }
  if (!isIsoTimestamp(record?.createdAt)) {
    issues.push("createdAt must be ISO-8601");
  }
  issues.push(...validateMeaningfulMemoryContent(record));

  return issues.length > 0 ? { ok: false, issues } : { ok: true };
}

function validateMeaningfulMemoryContent(record) {
  const content = normalizeObject(record?.content);
  if (Object.keys(content).length === 0) {
    return [];
  }
  if (record?.type === MemoryRecordType.WORKING_MEMORY) {
    return validateWorkingMemoryCheckpointContent(content);
  }
  if (record?.type === MemoryRecordType.REPAIR_CASE) {
    return validateRepairCaseContent(content);
  }
  return [];
}

function validateWorkingMemoryCheckpointContent(content) {
  const issues = [];
  if (
    hasMeaningfulValue(content.contextSourceQuality) &&
    !MEMORY_CHECKPOINT_CONTEXT_SOURCE_QUALITY.includes(normalizeText(content.contextSourceQuality))
  ) {
    issues.push("content.contextSourceQuality is invalid");
  }
  if (hasMeaningfulValue(content.captureBoundary) && !normalizeText(content.captureBoundary)) {
    issues.push("content.captureBoundary must describe a judgment log or operational summary");
  }
  if (hasMeaningfulValue(content.explorationHypothesis)) {
    issues.push(...validateExplorationHypothesis(content.explorationHypothesis, "content.explorationHypothesis"));
  }
  if (hasMeaningfulValue(content.suspectedFiles) && !isStringArray(content.suspectedFiles)) {
    issues.push("content.suspectedFiles must be a string array");
  }
  if (hasMeaningfulValue(content.suspectedLines)) {
    issues.push(...validateSuspectedLines(content.suspectedLines, "content.suspectedLines"));
  }
  if (hasMeaningfulValue(content.rejectedHypotheses)) {
    issues.push(...validateRejectedHypotheses(content.rejectedHypotheses, "content.rejectedHypotheses"));
  }
  if (hasMeaningfulValue(content.tension_note)) {
    issues.push(...validateStructuredObject(content.tension_note, "content.tension_note"));
  }
  if (hasMeaningfulValue(content.stopReason)) {
    issues.push(...validateStructuredObject(content.stopReason, "content.stopReason"));
  }
  if (hasMeaningfulValue(content.uncertainty)) {
    issues.push(...validateStructuredObject(content.uncertainty, "content.uncertainty"));
  }
  if (hasMeaningfulValue(content.failureReasoning)) {
    issues.push(...validateStructuredObject(content.failureReasoning, "content.failureReasoning"));
  }
  if (hasMeaningfulValue(content.successPattern)) {
    issues.push(...validateStructuredObject(content.successPattern, "content.successPattern"));
  }
  if (hasMeaningfulValue(content.handoffMemory)) {
    issues.push(...validateStructuredObject(content.handoffMemory, "content.handoffMemory"));
  }
  return issues;
}

function validateRepairCaseContent(content) {
  const issues = [];
  if (hasMeaningfulValue(content.failureReasoning)) {
    issues.push(...validateStructuredObject(content.failureReasoning, "content.failureReasoning"));
  }
  if (hasMeaningfulValue(content.successPattern)) {
    issues.push(...validateStructuredObject(content.successPattern, "content.successPattern"));
  }
  if (hasMeaningfulValue(content.rejectedHypotheses)) {
    issues.push(...validateRejectedHypotheses(content.rejectedHypotheses, "content.rejectedHypotheses"));
  }
  return issues;
}

function validateExplorationHypothesis(value, fieldName) {
  const issues = [];
  const input = normalizeObject(value);
  if (Object.keys(input).length === 0) {
    return [`${fieldName} must be an object`];
  }
  if (!normalizeText(input.summary ?? input.hypothesis)) {
    issues.push(`${fieldName}.summary is required`);
  }
  if (
    input.status !== undefined &&
    !EXPLORATION_HYPOTHESIS_STATUS.includes(normalizeText(input.status))
  ) {
    issues.push(`${fieldName}.status is invalid`);
  }
  if (input.suspectedFiles !== undefined && !isStringArray(input.suspectedFiles)) {
    issues.push(`${fieldName}.suspectedFiles must be a string array`);
  }
  if (input.suspectedLines !== undefined) {
    issues.push(...validateSuspectedLines(input.suspectedLines, `${fieldName}.suspectedLines`));
  }
  return issues;
}

function validateSuspectedLines(value, fieldName) {
  const issues = [];
  if (!Array.isArray(value)) {
    return [`${fieldName} must be an array`];
  }
  value.forEach((item, index) => {
    const input = normalizeObject(item);
    if (Object.keys(input).length === 0) {
      issues.push(`${fieldName}[${index}] must be an object`);
      return;
    }
    if (!normalizeText(input.file)) {
      issues.push(`${fieldName}[${index}].file is required`);
    }
    for (const key of ["line", "lineStart", "lineEnd"]) {
      if (hasMeaningfulValue(input[key]) && !isPositiveInteger(input[key])) {
        issues.push(`${fieldName}[${index}].${key} must be a positive integer`);
      }
    }
  });
  return issues;
}

function validateRejectedHypotheses(value, fieldName) {
  const issues = [];
  if (!Array.isArray(value)) {
    return [`${fieldName} must be an array`];
  }
  value.forEach((item, index) => {
    const input = normalizeObject(item);
    if (!normalizeText(input.summary ?? input.hypothesis)) {
      issues.push(`${fieldName}[${index}].summary is required`);
    }
    if (!normalizeText(input.whyRejected ?? input.reason)) {
      issues.push(`${fieldName}[${index}].whyRejected is required`);
    }
  });
  return issues;
}

function validateStructuredObject(value, fieldName) {
  return Object.keys(normalizeObject(value)).length === 0 ? [`${fieldName} must be an object`] : [];
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => normalizeText(item));
}

function isPositiveInteger(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0;
}

function hasMeaningfulValue(value) {
  return value !== undefined && value !== null;
}

function normalizePriority(value) {
  const numeric = Number(value ?? 50);
  if (!Number.isFinite(numeric)) {
    return 50;
  }
  return Math.round(numeric);
}

function normalizeTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function normalizeTimestamp(value) {
  const ts = value ? String(value).trim() : new Date().toISOString();
  return ts;
}

function isIsoTimestamp(value) {
  const text = String(value ?? "").trim();
  return Boolean(text) && Number.isFinite(Date.parse(text)) && text.includes("T");
}
