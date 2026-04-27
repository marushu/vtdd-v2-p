import test from "node:test";
import assert from "node:assert/strict";
import { buildCorsHeaders } from "../scripts/run-passkey-operator-helper.mjs";

test("desktop helper bridge returns CORS headers for worker-hosted sync requests", () => {
  const headers = buildCorsHeaders("https://sample-user-vtdd.example.workers.dev");
  assert.equal(headers["access-control-allow-origin"], "https://sample-user-vtdd.example.workers.dev");
  assert.equal(headers["access-control-allow-methods"], "POST, GET, OPTIONS");
  assert.equal(headers["access-control-allow-headers"], "content-type");
});
