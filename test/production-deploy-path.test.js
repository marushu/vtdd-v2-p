import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "production-deploy-path.md");
const WORKFLOW_PATH = path.join(
  process.cwd(),
  ".github",
  "workflows",
  "deploy-production.yml"
);
const WRANGLER_PATH = path.join(process.cwd(), "wrangler.toml");
const OWNER_D1_DATABASE_ID = "a544d950-4a6a-4c6f-87e7-4671fe87b70d";

test("production deploy doc defines the governed GitHub Actions deploy path", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("GitHub Actions"), true);
  assert.equal(doc.includes("Cloudflare Workers"), true);
  assert.equal(doc.includes("`wrangler deploy --env production`"), true);
  assert.equal(doc.includes("GitHub Environment `production`"), true);
  assert.equal(doc.includes("`approval_phrase=GO`"), true);
  assert.equal(doc.includes("`approval_grant_id=<real passkey approval grant id>`"), true);
  assert.equal(doc.includes("`runtime_url=<user-owned worker runtime>`"), true);
  assert.equal(doc.includes("`VTDD_GATEWAY_BEARER_TOKEN`"), true);
  assert.equal(doc.includes("`actionType=deploy_production`"), true);
  assert.equal(doc.includes("`highRiskKind=deploy_production`"), true);
  assert.equal(doc.includes("`CLOUDFLARE_API_TOKEN`"), true);
  assert.equal(doc.includes("`CLOUDFLARE_ACCOUNT_ID`"), true);
  assert.equal(doc.includes("`VTDD_GATEWAY_BEARER_TOKEN`"), true);
  assert.equal(doc.includes("hard prerequisites"), true);
  assert.equal(doc.includes("docs/setup/cloudflare-deploy-secret-sync.md"), true);
  assert.equal(doc.includes("Worker runtime secrets"), true);
  assert.equal(doc.includes("`VTDD_MEMORY_D1`"), true);
  assert.equal(doc.includes("real passkey registration"), true);
  assert.equal(doc.includes("owner-specific Cloudflare"), true);
  assert.equal(doc.includes("must not be committed"), true);
});

test("deploy-production workflow enforces the MVP production deploy boundary", () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
  assert.equal(workflow.includes("name: deploy-production"), true);
  assert.equal(workflow.includes("workflow_dispatch:"), true);
  assert.equal(workflow.includes("if: github.ref == 'refs/heads/main'"), true);
  assert.equal(workflow.includes("environment: production"), true);
  assert.equal(workflow.includes('github.event.inputs.approval_phrase }}" != "GO"'), true);
  assert.equal(workflow.includes('github.event.inputs.runtime_url'), true);
  assert.equal(workflow.includes('github.event.inputs.approval_grant_id'), true);
  assert.equal(workflow.includes("Preflight deploy credentials"), true);
  assert.equal(workflow.includes("Missing required Actions secret: VTDD_GATEWAY_BEARER_TOKEN"), true);
  assert.equal(workflow.includes("Missing required Actions secret: CLOUDFLARE_API_TOKEN"), true);
  assert.equal(workflow.includes("Missing required Actions secret: CLOUDFLARE_ACCOUNT_ID"), true);
  assert.equal(workflow.includes("Validate real passkey approval grant"), true);
  assert.equal(
    workflow.includes('VTDD_GATEWAY_BEARER_TOKEN: ${{ secrets.VTDD_GATEWAY_BEARER_TOKEN }}'),
    true
  );
  assert.equal(workflow.includes("scripts/validate-deploy-approval-grant.mjs"), true);
  assert.equal(workflow.includes("apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}"), true);
  assert.equal(
    workflow.includes("CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}"),
    true
  );
  assert.equal(workflow.includes('command: deploy --env production'), true);
});

test("wrangler config fixes worker runtime entry and production environment", () => {
  const wrangler = fs.readFileSync(WRANGLER_PATH, "utf8");
  assert.equal(wrangler.includes('main = "src/worker.js"'), true);
  assert.equal(wrangler.includes("[env.production]"), true);
  assert.equal(wrangler.includes('name = "vtdd-v2-mvp"'), true);
  assert.equal(wrangler.includes(OWNER_D1_DATABASE_ID), false);
  assert.equal(wrangler.includes("database_id"), false);
});
