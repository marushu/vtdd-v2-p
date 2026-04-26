import test from "node:test";
import assert from "node:assert/strict";
import { buildCorsHeaders } from "../scripts/run-passkey-operator-helper.mjs";

test("desktop helper bridge returns CORS headers for worker-hosted sync requests", () => {
  const headers = buildCorsHeaders("https://vtdd-v2-mvp.polished-tree-da7c.workers.dev");
  assert.equal(
    headers["access-control-allow-origin"],
    "https://vtdd-v2-mvp.polished-tree-da7c.workers.dev"
  );
  assert.equal(headers["access-control-allow-methods"], "POST, GET, OPTIONS");
  assert.equal(headers["access-control-allow-headers"], "content-type");
});
