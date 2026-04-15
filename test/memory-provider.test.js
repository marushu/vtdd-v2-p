import test from "node:test";
import assert from "node:assert/strict";
import {
  MemoryRecordType,
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
