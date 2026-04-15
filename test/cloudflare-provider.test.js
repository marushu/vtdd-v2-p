import test from "node:test";
import assert from "node:assert/strict";
import { createCloudflareMemoryProvider } from "../src/core/index.js";

test("cloudflare provider stores via d1 and vectorize", async () => {
  const inserted = [];
  const upserted = [];
  const provider = createCloudflareMemoryProvider({
    d1: {
      async insertRecord(record) {
        inserted.push(record);
      },
      async queryRecords() {
        return inserted;
      }
    },
    vectorize: {
      async upsert(entry) {
        upserted.push(entry);
      },
      async query() {
        return [];
      }
    },
    embedder: async () => [0.1, 0.2, 0.3]
  });

  const result = await provider.store({
    id: "mem-1",
    type: "working_memory",
    content: { note: "runtime truth stale handling" },
    tags: ["runtime"]
  });
  assert.equal(result.ok, true);
  assert.equal(inserted.length, 1);
  assert.equal(upserted.length, 1);
});

test("cloudflare provider persists large payload to r2 and hydrates", async () => {
  const rows = [];
  const objects = new Map();
  const provider = createCloudflareMemoryProvider({
    d1: {
      async insertRecord(record) {
        rows.push(record);
      },
      async queryRecords() {
        return rows;
      }
    },
    r2: {
      async put(key, value) {
        objects.set(key, value);
      },
      async get(key) {
        return objects.get(key) ?? null;
      }
    },
    blobThreshold: 10
  });

  await provider.store({
    id: "mem-blob",
    type: "working_memory",
    content: { long: "abcdefghijklmnopqrstuvwxyz" },
    tags: ["blob"]
  });

  const retrieved = await provider.retrieve({});
  assert.equal(retrieved.length, 1);
  assert.equal(retrieved[0].content.long, "abcdefghijklmnopqrstuvwxyz");
});

test("cloudflare provider query falls back to d1 when vectorize path has no hits", async () => {
  const rows = [
    {
      id: "mem-q",
      type: "decision_log",
      content: { decision: "keep issue as spec" },
      tags: ["policy"]
    }
  ];
  const provider = createCloudflareMemoryProvider({
    d1: {
      async insertRecord() {},
      async queryRecords() {
        return rows;
      }
    }
  });

  const result = await provider.query({ text: "issue", type: "decision_log" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "mem-q");
});
