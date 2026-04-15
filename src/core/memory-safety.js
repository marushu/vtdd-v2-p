const ALLOWED_RECORD_TYPES = new Set([
  "constitution",
  "decision_log",
  "working_memory",
  "temperature_note",
  "repair_case",
  "proposal_log",
  "alias_registry",
  "approval_log",
  "execution_log"
]);

const SENSITIVE_PATTERNS = [
  { kind: "openai_api_key", regex: /sk-[a-zA-Z0-9]{20,}/g },
  { kind: "github_token", regex: /\bgh[pousr]_[a-zA-Z0-9]{20,}\b/g },
  { kind: "aws_access_key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "private_key_block", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { kind: "generic_secret_assignment", regex: /\b(token|secret|password|api[_-]?key)\b\s*[:=]\s*\S+/gi }
];

export function evaluateMemorySafety(input) {
  const { recordType, content, metadata = {} } = input ?? {};
  const normalizedType = normalize(recordType);
  if (!normalizedType) {
    return deny("invalid_record_type", "record type is required");
  }

  if (normalizedType === "canonical_spec") {
    return deny(
      "canonical_spec_must_live_in_git",
      "canonical specification must be managed in Git, not DB memory"
    );
  }

  if (!ALLOWED_RECORD_TYPES.has(normalizedType)) {
    return deny("unsupported_record_type", `unsupported record type: ${recordType}`);
  }

  if (normalizedType === "working_memory" && metadata?.fullCasualChat === true) {
    return deny(
      "no_full_casual_chat_history",
      "full casual chat transcript must not be stored in memory"
    );
  }

  const scanTarget = `${toText(content)}\n${toText(metadata)}`;
  const findings = inspectSensitiveContent(scanTarget);
  if (findings.length > 0) {
    return deny(
      "memory_must_exclude_secrets",
      "record contains sensitive token/key material",
      { findings }
    );
  }

  return {
    ok: true,
    storageTarget: "db",
    normalizedRecordType: normalizedType
  };
}

export function inspectSensitiveContent(text) {
  const source = String(text ?? "");
  const findings = [];
  for (const pattern of SENSITIVE_PATTERNS) {
    const matches = source.match(pattern.regex) ?? [];
    if (matches.length > 0) {
      findings.push({ kind: pattern.kind, count: matches.length });
    }
    pattern.regex.lastIndex = 0;
  }
  return findings;
}

export function sanitizeMemoryPayload(input) {
  const { content, metadata = {} } = input ?? {};
  return {
    content: redactSensitiveText(toText(content)),
    metadata: redactObject(metadata)
  };
}

function redactObject(value) {
  if (Array.isArray(value)) {
    return value.map(redactObject);
  }
  if (!value || typeof value !== "object") {
    return redactLeaf(value);
  }

  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = redactObject(item);
  }
  return out;
}

function redactLeaf(value) {
  if (typeof value !== "string") {
    return value;
  }
  return redactSensitiveText(value);
}

function redactSensitiveText(text) {
  let out = String(text ?? "");
  for (const pattern of SENSITIVE_PATTERNS) {
    out = out.replace(pattern.regex, "[REDACTED]");
    pattern.regex.lastIndex = 0;
  }
  return out;
}

function toText(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function deny(rule, reason, detail = {}) {
  return {
    ok: false,
    rule,
    reason,
    ...detail
  };
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}
