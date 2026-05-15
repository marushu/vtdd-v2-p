#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadDesktopBootstrapVault } from "../src/core/desktop-bootstrap-vault.js";
import { createDecisionLogEntry, createProposalLogEntry } from "../src/core/log-contracts.js";
import { createMemoryRecord } from "../src/core/memory-schema.js";
import { evaluateMemorySafety } from "../src/core/memory-safety.js";

const DEFAULT_LIMIT = 5;
const DEFAULT_PHASE = "execution";

export function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() ?? "";
  const options = { _: [] };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      options._.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split(/=(.*)/s, 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = inlineValue !== undefined ? inlineValue : args[index + 1];

    if (inlineValue === undefined) {
      index += 1;
    }

    if (options[key] === undefined) {
      options[key] = value ?? true;
    } else if (Array.isArray(options[key])) {
      options[key].push(value ?? true);
    } else {
      options[key] = [options[key], value ?? true];
    }
  }

  return { command, options };
}

export function buildInventorySql() {
  return [
    "SELECT type, COUNT(*) AS count",
    "FROM vtdd_memory_records",
    "GROUP BY type",
    "ORDER BY type;"
  ].join(" ");
}

export function buildRecentRecordsSql(limit = DEFAULT_LIMIT) {
  const normalizedLimit = normalizeLimit(limit);
  return [
    "SELECT id, type, priority, tags_json, created_at",
    "FROM vtdd_memory_records",
    "ORDER BY created_at DESC",
    `LIMIT ${normalizedLimit};`
  ].join(" ");
}

export function buildCrossMemorySql({ relatedIssue, limit = DEFAULT_LIMIT }) {
  const normalizedIssue = normalizePositiveInteger(relatedIssue, "relatedIssue");
  const normalizedLimit = normalizeLimit(limit);
  return [
    "SELECT id, type, content_json, metadata_json, priority, tags_json, created_at",
    "FROM vtdd_memory_records",
    "WHERE type IN ('decision_log', 'proposal_log')",
    `AND json_extract(content_json, '$.relatedIssue') = ${normalizedIssue}`,
    "ORDER BY priority DESC, created_at DESC",
    `LIMIT ${normalizedLimit};`
  ].join(" ");
}

export function buildInsertRecordSql(record) {
  const createdAt = record.createdAt;
  const columns = [
    "id",
    "type",
    "content_json",
    "content_ref",
    "metadata_json",
    "priority",
    "tags_json",
    "created_at"
  ];
  const values = [
    sqlString(record.id),
    sqlString(record.type),
    sqlString(JSON.stringify(record.content)),
    "NULL",
    sqlString(JSON.stringify(record.metadata)),
    String(record.priority),
    sqlString(JSON.stringify(record.tags)),
    sqlString(createdAt)
  ];
  return [
    `INSERT OR REPLACE INTO vtdd_memory_records (${columns.join(", ")})`,
    `VALUES (${values.join(", ")});`
  ].join(" ");
}

export function buildRuntimeCrossMemoryRequest(options) {
  const env = options.env ?? process.env;
  const runtimeUrl = normalizeRequiredText(
    options.runtimeUrl ?? env.VTDD_RUNTIME_URL,
    "runtime-url"
  );
  const token = normalizeRequiredText(
    env.VTDD_GATEWAY_BEARER_TOKEN,
    "VTDD_GATEWAY_BEARER_TOKEN"
  );
  const url = new URL("/v2/retrieve/cross", runtimeUrl);
  url.searchParams.set("phase", String(options.phase ?? DEFAULT_PHASE));
  url.searchParams.set("limit", String(normalizeLimit(options.limit ?? DEFAULT_LIMIT)));
  url.searchParams.set("responseMode", "action_visible");
  if (options.relatedIssue) {
    url.searchParams.set("relatedIssue", String(normalizePositiveInteger(options.relatedIssue, "relatedIssue")));
  }
  if (options.text) {
    url.searchParams.set("text", String(options.text));
  }

  return {
    url: url.toString(),
    headers: {
      authorization: `Bearer ${token}`
    }
  };
}

export function buildRuntimeMemoryWriteRequest(options) {
  const env = options.env ?? process.env;
  const runtimeUrl = normalizeRequiredText(
    options.runtimeUrl ?? env.VTDD_RUNTIME_URL,
    "runtime-url"
  );
  const token = normalizeRequiredText(
    env.VTDD_GATEWAY_BEARER_TOKEN,
    "VTDD_GATEWAY_BEARER_TOKEN"
  );
  const payload = normalizeObject(options.payload);
  if (payload.confirmed !== true) {
    throw new Error("confirmed=true is required before writing memory through runtime");
  }
  const url = new URL("/v2/action/memory-write", runtimeUrl);

  return {
    url: url.toString(),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      ...payload,
      responseMode: payload.responseMode ?? "action_visible"
    })
  };
}

export function buildRuntimeOperationalMemoryRequest(options) {
  const env = options.env ?? process.env;
  const runtimeUrl = normalizeRequiredText(
    options.runtimeUrl ?? env.VTDD_RUNTIME_URL,
    "runtime-url"
  );
  const token = normalizeRequiredText(
    env.VTDD_GATEWAY_BEARER_TOKEN,
    "VTDD_GATEWAY_BEARER_TOKEN"
  );
  const url = new URL("/v2/retrieve/operational-memory", runtimeUrl);
  url.searchParams.set("limit", String(normalizeLimit(options.limit ?? DEFAULT_LIMIT)));
  url.searchParams.set("responseMode", "action_visible");
  if (options.repository) {
    url.searchParams.set("repository", String(options.repository));
  }
  if (options.text) {
    url.searchParams.set("text", String(options.text));
  }
  if (options.currentState) {
    url.searchParams.set("currentState", String(options.currentState));
  }
  if (options.runtimeTruthSource) {
    url.searchParams.set("runtimeTruthSource", String(options.runtimeTruthSource));
  }
  if (options.checkedAt) {
    url.searchParams.set("checkedAt", String(options.checkedAt));
  }

  return {
    url: url.toString(),
    headers: {
      authorization: `Bearer ${token}`
    }
  };
}

export function buildCheckpointPayload(options) {
  const relatedIssue = normalizePositiveInteger(options.relatedIssue, "relatedIssue");
  const tags = mergeTags(options.tag ?? options.tags, [
    `issue:${relatedIssue}`,
    "rag-checkpoint",
    "memory-savepoint"
  ]);
  return {
    recordType: "working_memory",
    confirmed: normalizeBoolean(options.confirmed),
    ownerConsent: normalizeOptionalText(options.ownerConsent),
    repository: normalizeOptionalText(options.repository),
    relatedIssue,
    summary: normalizeRequiredText(options.summary, "summary"),
    details: normalizeOptionalText(options.details),
    checkpointReason: normalizeOptionalText(options.checkpointReason),
    thoughtLocation: normalizeOptionalText(options.thoughtLocation),
    userTension: normalizeOptionalText(options.userTension),
    contextSourceQuality: normalizeOptionalText(options.contextSourceQuality) || "full_thread_context",
    hypothesis: normalizeOptionalText(options.hypothesis),
    expectedFiles: normalizeList(options.expectedFile ?? options.expectedFiles),
    evidenceLinks: normalizeList(options.evidenceLink ?? options.evidenceLinks),
    previousRecordIds: normalizeList(options.previousRecordId ?? options.previousRecordIds),
    captureBoundary: "judgment_log_not_chain_of_thought",
    priority: options.priority ?? 75,
    timestamp: options.timestamp ?? new Date().toISOString(),
    tags
  };
}

export function buildDecisionRecord(options) {
  const relatedIssue = normalizePositiveInteger(options.relatedIssue, "relatedIssue");
  const timestamp = options.timestamp ?? new Date().toISOString();
  const decision = createDecisionLogEntry({
    decision: options.decision,
    rationale: options.rationale,
    relatedIssue,
    decidedBy: options.decidedBy,
    timestamp,
    supersededBy: options.supersededBy ?? null
  });
  if (!decision.ok) {
    throw new Error(`invalid decision_log: ${decision.issues.join("; ")}`);
  }

  return buildSafeMemoryRecord({
    id: normalizeRequiredText(options.id, "id"),
    type: "decision_log",
    content: decision.entry,
    metadata: {
      repository: normalizeOptionalText(options.repository),
      source: "vtdd-memory-cli",
      issue: relatedIssue
    },
    priority: options.priority ?? 90,
    tags: mergeTags(options.tag ?? options.tags, [`issue:${relatedIssue}`, "memory-bridge"]),
    createdAt: timestamp
  });
}

export function buildProposalRecord(options) {
  const relatedIssue = options.relatedIssue
    ? normalizePositiveInteger(options.relatedIssue, "relatedIssue")
    : null;
  const timestamp = options.timestamp ?? new Date().toISOString();
  const proposal = createProposalLogEntry({
    hypothesis: options.hypothesis,
    options: normalizeList(options.option ?? options.options),
    rejectedReasons: parseJsonArray(options.rejectedReasons, "rejected-reasons"),
    concerns: normalizeList(options.concern ?? options.concerns),
    unresolvedQuestions: normalizeList(options.unresolvedQuestion ?? options.unresolvedQuestions),
    relatedIssue,
    proposedBy: options.proposedBy,
    timestamp
  });
  if (!proposal.ok) {
    throw new Error(`invalid proposal_log: ${proposal.issues.join("; ")}`);
  }

  return buildSafeMemoryRecord({
    id: normalizeRequiredText(options.id, "id"),
    type: "proposal_log",
    content: proposal.entry,
    metadata: {
      repository: normalizeOptionalText(options.repository),
      source: "vtdd-memory-cli",
      issue: relatedIssue
    },
    priority: options.priority ?? 80,
    tags: mergeTags(
      options.tag ?? options.tags,
      relatedIssue ? [`issue:${relatedIssue}`, "memory-bridge"] : ["memory-bridge"]
    ),
    createdAt: timestamp
  });
}

export function buildGenericRecord(options) {
  const content = parseJson(options.contentJson, "content-json");
  const metadata = {
    ...parseJson(options.metadataJson ?? "{}", "metadata-json"),
    source: "vtdd-memory-cli"
  };
  return buildSafeMemoryRecord({
    id: normalizeRequiredText(options.id, "id"),
    type: normalizeRequiredText(options.type, "type"),
    content,
    metadata,
    priority: options.priority ?? 50,
    tags: normalizeList(options.tag ?? options.tags),
    createdAt: options.timestamp ?? new Date().toISOString()
  });
}

export async function runCli(argv = process.argv.slice(2), io = defaultIo) {
  const { command, options } = parseArgs(argv);

  if (command === "inventory") {
    const result = runWranglerD1({
      database: resolveDatabase(options),
      command: `${buildInventorySql()} ${buildRecentRecordsSql(options.limit ?? DEFAULT_LIMIT)}`
    });
    io.writeJson(result, options);
    return result;
  }

  if (command === "retrieve-cross") {
    const transport = options.transport ?? inferTransport(options);
    if (transport === "runtime") {
      const runtimeOptions = await withRuntimeMachineAuth(options);
      const request = buildRuntimeCrossMemoryRequest(runtimeOptions);
      const response = await fetch(request.url, { headers: request.headers });
      const text = await response.text();
      const body = parseMaybeJson(text);
      const result = { ok: response.ok, status: response.status, body };
      io.writeJson(result, options);
      if (!response.ok) {
        throw new Error(`runtime retrieve-cross failed with status ${response.status}`);
      }
      return result;
    }

    const result = runWranglerD1({
      database: resolveDatabase(options),
      command: buildCrossMemorySql(options)
    });
    io.writeJson(result, options);
    return result;
  }

  if (command === "retrieve-operational") {
    const runtimeOptions = await withRuntimeMachineAuth(options);
    const request = buildRuntimeOperationalMemoryRequest(runtimeOptions);
    const response = await fetch(request.url, { headers: request.headers });
    const text = await response.text();
    const body = parseMaybeJson(text);
    const result = { ok: response.ok, status: response.status, body };
    io.writeJson(result, options);
    if (!response.ok) {
      throw new Error(`runtime retrieve-operational failed with status ${response.status}`);
    }
    return result;
  }

  if (command === "write-runtime-checkpoint") {
    const runtimeOptions = await withRuntimeMachineAuth(options);
    const payload = buildCheckpointPayload({
      ...runtimeOptions,
      confirmed: normalizeBoolean(options.confirmed)
    });
    const request = buildRuntimeMemoryWriteRequest({ ...runtimeOptions, payload });
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body
    });
    const text = await response.text();
    const body = parseMaybeJson(text);
    const result = { ok: response.ok, status: response.status, body };
    io.writeJson(result, options);
    if (!response.ok) {
      throw new Error(`runtime memory write failed with status ${response.status}`);
    }
    return result;
  }

  if (command === "write-decision") {
    const record = buildDecisionRecord(options);
    const result = writeRecordToD1(record, options);
    io.writeJson({ ...result, record }, options);
    return { ...result, record };
  }

  if (command === "write-proposal") {
    const record = buildProposalRecord(options);
    const result = writeRecordToD1(record, options);
    io.writeJson({ ...result, record }, options);
    return { ...result, record };
  }

  if (command === "write-record") {
    const record = buildGenericRecord(options);
    const result = writeRecordToD1(record, options);
    io.writeJson({ ...result, record }, options);
    return { ...result, record };
  }

  throw new Error(`unknown command: ${command || "(missing)"}`);
}

export async function withRuntimeMachineAuth(options = {}) {
  const env = options.env ?? process.env;
  if (normalizeText(env.VTDD_GATEWAY_BEARER_TOKEN)) {
    return options;
  }

  const vault = await loadDesktopBootstrapVault({
    manifestPath: options.manifestPath
  });
  if (!vault.ok) {
    throw new Error(
      `desktop maintenance required: gateway_bearer_token_missing; ${vault.issues.join("; ")}`
    );
  }

  const bearerToken = normalizeText(vault.vault?.gateway?.bearerToken);
  if (!bearerToken) {
    throw new Error("desktop maintenance required: gateway_bearer_token_missing");
  }

  return {
    ...options,
    env: {
      ...env,
      VTDD_GATEWAY_BEARER_TOKEN: bearerToken
    }
  };
}

function buildSafeMemoryRecord(input) {
  const safety = evaluateMemorySafety({
    recordType: input.type,
    content: input.content,
    metadata: input.metadata
  });
  if (!safety.ok) {
    throw new Error(`unsafe memory record: ${safety.rule}: ${safety.reason}`);
  }

  const created = createMemoryRecord(input);
  if (!created.ok) {
    throw new Error(`invalid memory record: ${created.issues.join("; ")}`);
  }
  return created.record;
}

function writeRecordToD1(record, options) {
  return runWranglerD1({
    database: resolveDatabase(options),
    command: buildInsertRecordSql(record)
  });
}

function runWranglerD1({ database, command }) {
  const result = spawnSync("npx", ["wrangler", "d1", "execute", database, "--remote", "--command", command], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`wrangler d1 execute failed: ${result.stderr || result.stdout}`);
  }
  return {
    ok: true,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function resolveDatabase(options) {
  return normalizeRequiredText(
    options.database ?? process.env.VTDD_MEMORY_D1_DATABASE_NAME,
    "database"
  );
}

function inferTransport(options) {
  return options.runtimeUrl || process.env.VTDD_RUNTIME_URL ? "runtime" : "d1";
}

function normalizeLimit(value) {
  const numeric = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isInteger(numeric) || numeric <= 0 || numeric > 100) {
    throw new Error("limit must be an integer between 1 and 100");
  }
  return numeric;
}

function normalizePositiveInteger(value, label) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return numeric;
}

function normalizeRequiredText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`${label} is required`);
  }
  return text;
}

function normalizeOptionalText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function normalizeList(value) {
  const items = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return items
    .flatMap((item) => String(item ?? "").split("\n"))
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeTags(input, requiredTags) {
  return [...new Set([...normalizeList(input), ...requiredTags])];
}

function parseJson(value, label) {
  try {
    return JSON.parse(normalizeRequiredText(value, label));
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

function parseJsonArray(value, label) {
  if (value === undefined) {
    return [];
  }
  const parsed = parseJson(value, label);
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array`);
  }
  return parsed;
}

function normalizeBoolean(value) {
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false" || value === undefined) {
    return false;
  }
  throw new Error("boolean option must be true or false");
}

function parseMaybeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function sqlString(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

const defaultIo = {
  writeJson(value, options) {
    const spacing = options.pretty === "true" || options.pretty === true ? 2 : 0;
    process.stdout.write(`${JSON.stringify(value, null, spacing)}\n`);
  }
};

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
