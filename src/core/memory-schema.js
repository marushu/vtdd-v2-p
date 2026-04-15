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

  return issues.length > 0 ? { ok: false, issues } : { ok: true };
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
