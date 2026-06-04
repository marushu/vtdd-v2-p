#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import {
  buildCostCheckerRuntimeTruth,
  normalizeCostCheckerConfig,
  parseCodexAnalyticsUsageText,
  sanitizeCodexAnalyticsUsageSnapshot
} from "../src/core/index.js";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function pick(args, ...keys) {
  for (const key of keys) {
    if (args[key] !== undefined) {
      return args[key];
    }
  }
  return undefined;
}

async function readInputText(args) {
  const inline = pick(args, "input-text", "text", "page-text");
  if (typeof inline === "string") {
    return inline;
  }
  const file = pick(args, "input-file", "file");
  if (!file) {
    return "";
  }
  if (file === "-") {
    return await new Promise((resolve, reject) => {
      let body = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        body += chunk;
      });
      process.stdin.on("end", () => resolve(body));
      process.stdin.on("error", reject);
    });
  }
  return readFile(file, "utf8");
}

function parseSnapshotArg(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`--snapshot-json is not valid JSON: ${error.message}`);
  }
}

async function buildCapturePayload(args, options = {}) {
  args = Array.isArray(args) ? parseArgs(args) : args || {};
  const now = options.now || new Date();
  const mode = String(pick(args, "mode") || "disabled");
  const config = normalizeCostCheckerConfig(
    {
      mode,
      ttlMs: pick(args, "ttl-ms"),
      ttlSeconds: pick(args, "ttl-seconds"),
      expiresAt: pick(args, "expires-at"),
      sessionId: pick(args, "session-id")
    },
    { now }
  );
  const text = await readInputText(args);
  const snapshotJson = parseSnapshotArg(pick(args, "snapshot-json"));
  const snapshot = text
    ? parseCodexAnalyticsUsageText(text, { captureMode: config.mode, now })
    : sanitizeCodexAnalyticsUsageSnapshot(snapshotJson || {}, { captureMode: config.mode, now });
  const payload = {
    mode: config.mode,
    repository: pick(args, "repository", "repo") || null,
    threadId: pick(args, "thread-id", "threadId") || null,
    relatedIssue: Number(pick(args, "related-issue", "issue") || 455),
    captureId: pick(args, "capture-id") || now.toISOString(),
    compareWithPrevious: pick(args, "no-compare") ? false : true,
    snapshot
  };
  return {
    ok: config.captureAllowed && snapshot.enabled,
    config,
    payload,
    runtimeTruth: buildCostCheckerRuntimeTruth(config, {
      observerAvailable: Boolean(text || snapshotJson),
      lastSnapshot: snapshot,
      now
    })
  };
}

async function postCapture({ runtimeUrl, token, payload }) {
  const base = String(runtimeUrl || "").replace(/\/+$/, "");
  if (!base) {
    throw new Error("--runtime-url or VTDD_RUNTIME_URL is required unless --dry-run is used");
  }
  if (!token) {
    throw new Error("--gateway-bearer-token or VTDD_GATEWAY_BEARER_TOKEN is required unless --dry-run is used");
  }
  const response = await fetch(`${base}/v2/codex-analytics/usage/snapshots`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  return {
    ok: response.ok && body.ok !== false,
    status: response.status,
    body
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const capture = await buildCapturePayload(args);
  const dryRun = Boolean(pick(args, "dry-run"));
  if (dryRun || !capture.ok) {
    console.log(JSON.stringify({ ...capture, dryRun: true }, null, 2));
    process.exitCode = capture.ok || capture.config.mode === "disabled" ? 0 : 2;
    return;
  }
  const posted = await postCapture({
    runtimeUrl: pick(args, "runtime-url") || process.env.VTDD_RUNTIME_URL,
    token: pick(args, "gateway-bearer-token") || process.env.VTDD_GATEWAY_BEARER_TOKEN,
    payload: capture.payload
  });
  console.log(JSON.stringify({ ...capture, posted }, null, 2));
  process.exitCode = posted.ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}

export { buildCapturePayload, parseArgs };
