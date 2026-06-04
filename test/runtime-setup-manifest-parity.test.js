import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  evaluateRuntimeSetupManifestParity,
  RUNTIME_SETUP_MANIFEST
} from "../src/core/custom-gpt-setup-artifacts.js";

test("runtime setup manifest parity passes for canonical Action Schema", () => {
  const openApiContent = fs.readFileSync("docs/setup/custom-gpt-actions-openapi.yaml", "utf8");
  const instructionsContent = fs.readFileSync("docs/setup/custom-gpt-instructions.md", "utf8");

  const result = evaluateRuntimeSetupManifestParity({
    openApiContent,
    instructionsContent
  });

  assert.equal(result.ok, true);
  assert.equal(result.canonical.routes.includes("/v2/retrieve/operational-memory"), true);
  assert.equal(result.canonical.routes.includes("/v2/codex-analytics/usage/snapshots"), true);
  assert.equal(result.canonical.routes.includes("/v2/retrieve/codex-analytics-usage"), true);
  assert.equal(result.canonical.operationIds.includes("vtddRetrieveOperationalMemory"), true);
  assert.equal(result.canonical.operationIds.includes("vtddIngestCodexAnalyticsUsageSnapshot"), true);
  assert.equal(result.canonical.operationIds.includes("vtddRetrieveCodexAnalyticsUsage"), true);
  assert.deepEqual(result.runtimeMissing.routes, []);
  assert.deepEqual(result.runtimeMissing.operationIds, []);
});

test("runtime setup manifest parity fails when operational memory route capability is missing", () => {
  const openApiContent = [
    "paths:",
    "  /v2/retrieve/operational-memory:",
    "    get:",
    "      operationId: vtddRetrieveOperationalMemory"
  ].join("\n");
  const runtimeManifest = {
    ...RUNTIME_SETUP_MANIFEST,
    routes: RUNTIME_SETUP_MANIFEST.routes.filter(
      (route) => route !== "/v2/retrieve/operational-memory"
    ),
    operationIds: RUNTIME_SETUP_MANIFEST.operationIds.filter(
      (operationId) => operationId !== "vtddRetrieveOperationalMemory"
    )
  };

  const result = evaluateRuntimeSetupManifestParity({
    openApiContent,
    runtimeManifest
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.runtimeMissing.routes, ["/v2/retrieve/operational-memory"]);
  assert.deepEqual(result.runtimeMissing.operationIds, ["vtddRetrieveOperationalMemory"]);
});
