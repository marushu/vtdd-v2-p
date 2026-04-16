import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MEMORY_RECORD_FIELD_POLICY,
  MEMORY_PROVIDER_FILTER_FIELDS,
  MEMORY_PROVIDER_METHODS,
  MEMORY_PROVIDER_QUERY_FIELDS,
  MemoryRecordType,
  REQUIRED_CORE_MEMORY_RECORD_TYPES,
  createInMemoryMemoryProvider,
  createMemoryRecord,
  retrieveConstitution,
  retrieveHybrid,
  validateMemoryProvider,
  validateMemoryRecord
} from "../src/core/index.js";

test("memory provider interface validation succeeds", () => {
  const provider = createInMemoryMemoryProvider();
  const result = validateMemoryProvider(provider);
  assert.equal(result.ok, true);
});

test("memory provider interface requires all canonical methods", () => {
  const invalid = validateMemoryProvider({
    async store() {},
    async retrieve() {},
    async query() {}
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.issues.includes("provider.validateRecord is required"), true);
});

test("memory schema validates required fields", () => {
  const created = createMemoryRecord({
    id: "mem-001",
    type: MemoryRecordType.DECISION_LOG,
    content: { decision: "use deterministic policy gate" },
    metadata: { source: "test" },
    priority: 80,
    tags: ["policy", "decision"],
    createdAt: "2026-04-15T11:00:00Z"
  });
  assert.equal(created.ok, true);

  const invalid = validateMemoryRecord({
    id: "",
    type: "unknown",
    content: null,
    metadata: [],
    priority: 1000,
    tags: "bad",
    createdAt: "invalid"
  });
  assert.equal(invalid.ok, false);
});

test("required core memory record types remain available", () => {
  for (const type of REQUIRED_CORE_MEMORY_RECORD_TYPES) {
    assert.equal(Object.values(MemoryRecordType).includes(type), true);
  }
});

test("memory schema docs list the same required core record types", () => {
  const doc = readFileSync(
    new URL("../docs/memory-schema.md", import.meta.url),
    "utf8"
  );

  for (const type of REQUIRED_CORE_MEMORY_RECORD_TYPES) {
    assert.equal(doc.includes(`\`${type}\``), true);
  }
});

test("memory field policy matches validation contract", () => {
  assert.equal(MEMORY_RECORD_FIELD_POLICY.metadata, "required_object_without_secrets");
  assert.equal(MEMORY_RECORD_FIELD_POLICY.priority, "integer_0_to_100");
  assert.equal(MEMORY_RECORD_FIELD_POLICY.tags, "string_array");
  assert.equal(MEMORY_RECORD_FIELD_POLICY.createdAt, "iso_8601_timestamp");
});

test("memory provider docs list canonical methods and fields", () => {
  const doc = readFileSync(
    new URL("../docs/memory-provider.md", import.meta.url),
    "utf8"
  );

  for (const method of MEMORY_PROVIDER_METHODS) {
    assert.equal(doc.includes(`\`${method}`), true);
  }

  for (const field of MEMORY_PROVIDER_FILTER_FIELDS) {
    assert.equal(doc.includes(`\`${field}`), true);
  }

  for (const field of MEMORY_PROVIDER_QUERY_FIELDS) {
    assert.equal(doc.includes(`\`${field}`), true);
  }
});

test("in-memory provider stores and retrieves constitution records", async () => {
  const provider = createInMemoryMemoryProvider();

  await provider.store({
    id: "c-001",
    type: MemoryRecordType.CONSTITUTION,
    content: { rule: "runtime_truth_over_memory" },
    metadata: { version: "v2" },
    priority: 90,
    tags: ["constitution"],
    createdAt: "2026-04-15T11:00:00Z"
  });

  await provider.store({
    id: "d-001",
    type: MemoryRecordType.DECISION_LOG,
    content: { decision: "enable go+passkey" },
    metadata: { issue: 9 },
    priority: 70,
    tags: ["approval"],
    createdAt: "2026-04-15T11:01:00Z"
  });

  const constitution = await retrieveConstitution(provider);
  assert.equal(constitution.length, 1);
  assert.equal(constitution[0].type, MemoryRecordType.CONSTITUTION);
});

test("hybrid retrieval merges retrieve and query results", async () => {
  const provider = createInMemoryMemoryProvider();

  await provider.store({
    id: "w-001",
    type: MemoryRecordType.WORKING_MEMORY,
    content: { note: "track reviewer loop risk" },
    metadata: {},
    priority: 60,
    tags: ["reviewer", "risk"],
    createdAt: "2026-04-15T11:03:00Z"
  });

  await provider.store({
    id: "w-002",
    type: MemoryRecordType.WORKING_MEMORY,
    content: { note: "runtime truth stale handling" },
    metadata: {},
    priority: 75,
    tags: ["runtime"],
    createdAt: "2026-04-15T11:04:00Z"
  });

  const results = await retrieveHybrid(provider, {
    type: MemoryRecordType.WORKING_MEMORY,
    text: "runtime",
    limit: 10
  });
  assert.equal(results.length >= 1, true);
  assert.equal(results.some((item) => item.id === "w-002"), true);
});
