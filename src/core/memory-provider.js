import { createMemoryRecord, validateMemoryRecord } from "./memory-schema.js";

export function validateMemoryProvider(provider) {
  const issues = [];
  if (!provider || typeof provider !== "object") {
    issues.push("provider must be an object");
  } else {
    if (typeof provider.store !== "function") {
      issues.push("provider.store is required");
    }
    if (typeof provider.retrieve !== "function") {
      issues.push("provider.retrieve is required");
    }
    if (typeof provider.query !== "function") {
      issues.push("provider.query is required");
    }
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true };
}

export function createInMemoryMemoryProvider() {
  const records = [];

  return {
    async store(input) {
      const created = createMemoryRecord(input);
      if (!created.ok) {
        return created;
      }
      records.push(created.record);
      return { ok: true, record: created.record };
    },

    async retrieve(filter = {}) {
      const type = normalize(filter.type);
      const limit = normalizeLimit(filter.limit);
      const tags = normalizeTags(filter.tags);

      let items = [...records];
      if (type) {
        items = items.filter((item) => item.type === type);
      }
      if (tags.length > 0) {
        items = items.filter((item) => tags.every((tag) => item.tags.includes(tag)));
      }
      items.sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt));
      return items.slice(0, limit);
    },

    async query(input = {}) {
      const text = normalize(input.text);
      const type = normalize(input.type);
      const limit = normalizeLimit(input.limit);

      let items = [...records];
      if (type) {
        items = items.filter((item) => item.type === type);
      }
      if (text) {
        items = items.filter((item) => JSON.stringify(item).toLowerCase().includes(text));
      }
      items.sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt));
      return items.slice(0, limit);
    },

    async validateRecord(input) {
      return validateMemoryRecord(input);
    }
  };
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeLimit(value) {
  const n = Number(value ?? 20);
  if (!Number.isFinite(n) || n <= 0) {
    return 20;
  }
  return Math.min(Math.floor(n), 200);
}

function normalizeTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalize(item))
    .filter(Boolean);
}
