import { evaluateMemorySafety } from "./memory-safety.js";
import { MemoryRecordType, validateMemoryRecord } from "./memory-schema.js";

const MEMORY_CANDIDATE_CONFIRMATION_PROMPT =
  "以下の内容で RAG に記憶します。よろしければ GO と言ってください。";

const TENSION_INTENSITY_VALUES = new Set(["low", "medium", "high"]);
const MAX_USER_WORDS = 3;
const MAX_USER_WORD_LENGTH = 160;

function buildRagMemoryCandidate(input = {}) {
  const recordType = normalizeRecordType(input.recordType ?? input.type);
  if (!recordType) {
    return invalid("recordType must be decision_log, proposal_log, working_memory, temperature_note, or repair_case");
  }

  const relatedIssue = normalizeIssue(input.relatedIssue);
  const repository = normalizeText(input.repository) || null;
  const timestamp = normalizeText(input.timestamp) || new Date().toISOString();
  const origin = normalizeOrigin(input.origin);
  const userWords = normalizeUserWords(input.userWords ?? input.user_words);
  const tensionNote = normalizeTensionNote(input.tensionNote ?? input.tension_note);
  const restartTriggers = normalizeStringArray(input.restartTriggers ?? input.restart_triggers);
  const outcome = normalizeOutcome(input.outcome);
  const summary = normalizeText(input.summary);

  const issues = [];
  if (!summary) {
    issues.push("summary is required");
  }
  if (!origin.surface && !origin.moment && !origin.trigger) {
    issues.push("origin must include surface, moment, or trigger");
  }
  if (userWords.length === 0) {
    issues.push("userWords must include at least one short quote or paraphrase");
  }
  if (!tensionNote.summary || !tensionNote.whyItMatters) {
    issues.push("tensionNote.summary and tensionNote.whyItMatters are required");
  }

  const content = {
    summary,
    details: normalizeText(input.details) || null,
    origin,
    userWords,
    tensionNote,
    restartTriggers,
    outcome,
    relatedIssue,
    repository,
    timestamp
  };

  const metadata = {
    ...normalizeObject(input.metadata),
    relatedIssue,
    repository,
    source: normalizeText(input.source) || "rag_memory_candidate",
    fullCasualChat: false,
    recallHooks: true
  };

  const record = {
    id: normalizeText(input.id) || buildCandidateRecordId({ recordType, relatedIssue, timestamp, summary }),
    type: recordType,
    content,
    metadata,
    priority: normalizePriority(input.priority, recordType === MemoryRecordType.TEMPERATURE_NOTE ? 75 : 65),
    tags: buildCandidateTags({ recordType, relatedIssue, repository, extraTags: input.tags }),
    createdAt: timestamp
  };

  const schema = validateMemoryRecord(record);
  if (!schema.ok) {
    issues.push(...schema.issues);
  }

  const safety = evaluateMemorySafety({
    recordType,
    content,
    metadata
  });
  if (!safety.ok) {
    issues.push(safety.reason || safety.rule || "memory safety check failed");
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
      candidate: {
        confirmationPrompt: MEMORY_CANDIDATE_CONFIRMATION_PROMPT,
        record
      }
    };
  }

  return {
    ok: true,
    candidate: {
      confirmationPrompt: MEMORY_CANDIDATE_CONFIRMATION_PROMPT,
      record,
      writePayload: {
        confirmed: false,
        recordType,
        repository,
        relatedIssue,
        summary,
        details: content.details,
        origin,
        userWords,
        tensionNote,
        restartTriggers,
        outcome,
        metadata,
        priority: record.priority,
        tags: record.tags,
        timestamp
      }
    }
  };
}

function normalizeRecordType(value) {
  const recordType = normalizeText(value);
  if (
    [
      MemoryRecordType.DECISION_LOG,
      MemoryRecordType.PROPOSAL_LOG,
      MemoryRecordType.WORKING_MEMORY,
      MemoryRecordType.TEMPERATURE_NOTE,
      MemoryRecordType.REPAIR_CASE
    ].includes(recordType)
  ) {
    return recordType;
  }
  return "";
}

function normalizeOrigin(value) {
  const origin = normalizeObject(value);
  return {
    surface: normalizeText(origin.surface),
    moment: normalizeText(origin.moment),
    trigger: normalizeText(origin.trigger),
    sourceUrl: normalizeText(origin.sourceUrl ?? origin.source_url) || null
  };
}

function normalizeTensionNote(value) {
  const note = normalizeObject(value);
  const intensity = normalizeText(note.intensity);
  return {
    summary: normalizeText(note.summary),
    intensity: TENSION_INTENSITY_VALUES.has(intensity) ? intensity : intensity || "medium",
    mode: normalizeText(note.mode),
    whyItMatters: normalizeText(note.whyItMatters ?? note.why_it_matters)
  };
}

function normalizeOutcome(value) {
  const outcome = normalizeObject(value);
  return {
    status: normalizeText(outcome.status),
    issue: normalizeText(outcome.issue),
    pullRequest: normalizeText(outcome.pullRequest ?? outcome.pull_request),
    notes: normalizeText(outcome.notes)
  };
}

function normalizeUserWords(value) {
  return normalizeStringArray(value)
    .slice(0, MAX_USER_WORDS)
    .map((item) => item.slice(0, MAX_USER_WORD_LENGTH));
}

function buildCandidateRecordId({ recordType, relatedIssue, timestamp, summary }) {
  const issuePart = relatedIssue ?? "none";
  const timestampPart = normalizeText(timestamp).replace(/[^0-9]/g, "").slice(0, 14);
  const summaryPart = normalizeTag(summary).slice(0, 40) || "candidate";
  return `${recordType}_${issuePart}_${timestampPart}_${summaryPart}`;
}

function buildCandidateTags({ recordType, relatedIssue, repository, extraTags }) {
  const tags = [
    recordType,
    "recall-hook",
    relatedIssue ? `issue:${relatedIssue}` : null,
    repository ? `repo:${normalizeTag(repository.replace("/", "_"))}` : null,
    ...normalizeStringArray(extraTags)
  ].filter(Boolean);
  return [...new Set(tags)];
}

function normalizeIssue(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function normalizeStringArray(value) {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values.map(normalizeText).filter(Boolean);
}

function normalizePriority(value, fallback) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeTag(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function invalid(reason) {
  return {
    ok: false,
    issues: [reason]
  };
}

export {
  MEMORY_CANDIDATE_CONFIRMATION_PROMPT,
  buildRagMemoryCandidate
};
