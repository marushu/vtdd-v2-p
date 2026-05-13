import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WORKFLOW_DIR = path.join(process.cwd(), ".github", "workflows");

test("GitHub Actions workflows use Node 24-compatible action/runtime versions", () => {
  const workflows = fs
    .readdirSync(WORKFLOW_DIR)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"));

  assert.ok(workflows.length > 0);

  for (const workflow of workflows) {
    const content = fs.readFileSync(path.join(WORKFLOW_DIR, workflow), "utf8");
    assert.equal(content.includes("actions/checkout@v4"), false, workflow);
    assert.equal(content.includes("actions/setup-node@v4"), false, workflow);
    assert.equal(content.includes("cloudflare/wrangler-action@v3"), false, workflow);
    assert.equal(content.includes("node-version: 20"), false, workflow);
  }

  const joined = workflows
    .map((workflow) => fs.readFileSync(path.join(WORKFLOW_DIR, workflow), "utf8"))
    .join("\n");

  assert.equal(joined.includes("actions/checkout@v6"), true);
  assert.equal(joined.includes("actions/setup-node@v6"), true);
  assert.equal(joined.includes("cloudflare/wrangler-action@v4"), true);
  assert.equal(joined.includes("node-version: 24"), true);
});
