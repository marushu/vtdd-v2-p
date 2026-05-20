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
const GITIGNORE_PATH = path.join(process.cwd(), ".gitignore");
const OWNER_D1_DATABASE_ID = "a544d950-4a6a-4c6f-87e7-4671fe87b70d";

test("production deploy doc defines the governed GitHub Actions deploy path", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("GitHub Actions"), true);
  assert.equal(doc.includes("Cloudflare Workers"), true);
  assert.equal(doc.includes("`wrangler deploy --env production`"), true);
  assert.equal(doc.includes("GitHub Environment `production`"), true);
  assert.equal(doc.includes("`approval_grant_id=<real passkey approval grant id>`"), true);
  assert.equal(doc.includes("`runtime_url=<user-owned worker runtime>`"), true);
  assert.equal(doc.includes("`VTDD_GATEWAY_BEARER_TOKEN`"), true);
  assert.equal(doc.includes("`actionType=deploy_production`"), true);
  assert.equal(doc.includes("`highRiskKind=deploy_production`"), true);
  assert.equal(doc.includes("`CLOUDFLARE_API_TOKEN`"), true);
  assert.equal(doc.includes("`CLOUDFLARE_ACCOUNT_ID`"), true);
  assert.equal(doc.includes("`CLOUDFLARE_D1_DATABASE_ID`"), true);
  assert.equal(doc.includes("`VTDD_GATEWAY_BEARER_TOKEN`"), true);
  assert.equal(doc.includes("hard prerequisites"), true);
  assert.equal(doc.includes("docs/setup/cloudflare-deploy-secret-sync.md"), true);
  assert.equal(doc.includes("Worker runtime secrets"), true);
  assert.equal(doc.includes("`VTDD_MEMORY_D1`"), true);
  assert.equal(doc.includes("real passkey registration"), true);
  assert.equal(doc.includes("owner-specific Cloudflare"), true);
  assert.equal(doc.includes("must not be committed"), true);
  assert.equal(doc.includes("`wrangler.production.local.toml`"), true);
  assert.equal(doc.includes("`wrangler.production.generated.toml`"), true);
  assert.equal(doc.includes("`VTDD_KNOWN_GOOD_COMMIT_SHA`"), true);
  assert.equal(doc.includes("must not silently treat `main` as known-good"), true);
  assert.equal(doc.includes("`VTDD_DEPLOY_NOTIFICATION_ISSUE_NUMBER`"), true);
  assert.equal(doc.includes("mentions the repository owner"), true);
  assert.equal(doc.includes("intentionally omits approval"), true);
  assert.equal(doc.includes("grant ids, tokens, and other secret values"), true);
  assert.equal(doc.includes("Dashboard pages are owner-facing surfaces"), true);
  assert.equal(doc.includes("`VTDD_DASHBOARD_ALLOWED_EMAILS`"), true);
  assert.equal(doc.includes("`VTDD_DASHBOARD_ALLOWED_GITHUB_LOGINS`"), true);
  assert.equal(doc.includes("`CF_ACCESS_TEAM_DOMAIN`"), true);
  assert.equal(doc.includes("`CF_ACCESS_AUD`"), true);
  assert.equal(doc.includes("`Cf-Access-Jwt-Assertion`"), true);
  assert.equal(doc.includes("fails closed"), true);
  assert.equal(doc.includes("Cloudflare Access"), true);
});

test("deploy-production workflow enforces the MVP production deploy boundary", () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
  assert.equal(workflow.includes("name: deploy-production"), true);
  assert.equal(workflow.includes("workflow_dispatch:"), true);
  assert.equal(workflow.includes("issues: write"), true);
  assert.equal(workflow.includes("if: github.ref == 'refs/heads/main'"), true);
  assert.equal(workflow.includes("environment: production"), true);
  assert.equal(workflow.includes("approval_phrase:"), true);
  assert.equal(workflow.includes("Deprecated compatibility input from pre-#430 operators"), true);
  assert.equal(workflow.includes('github.event.inputs.approval_phrase }}" != "GO"'), false);
  assert.equal(workflow.includes('github.event.inputs.runtime_url'), true);
  assert.equal(workflow.includes('github.event.inputs.approval_grant_id'), true);
  assert.equal(workflow.includes("Preflight deploy credentials"), true);
  assert.equal(workflow.includes("Missing required Actions secret: VTDD_GATEWAY_BEARER_TOKEN"), true);
  assert.equal(workflow.includes("Missing required Actions secret: CLOUDFLARE_API_TOKEN"), true);
  assert.equal(workflow.includes("Missing required Actions secret: CLOUDFLARE_ACCOUNT_ID"), true);
  assert.equal(workflow.includes("Missing required Actions secret: CLOUDFLARE_D1_DATABASE_ID"), true);
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
  assert.equal(workflow.includes("Generate production Wrangler config"), true);
  assert.equal(workflow.includes("VTDD_GITHUB_ACTIONS_REPOSITORY: ${{ github.repository }}"), true);
  assert.equal(workflow.includes("VTDD_KNOWN_GOOD_COMMIT_SHA: ${{ vars.VTDD_KNOWN_GOOD_COMMIT_SHA }}"), true);
  assert.equal(workflow.includes("VTDD_DASHBOARD_ALLOWED_EMAILS: ${{ vars.VTDD_DASHBOARD_ALLOWED_EMAILS }}"), true);
  assert.equal(
    workflow.includes("VTDD_DASHBOARD_ALLOWED_GITHUB_LOGINS: ${{ vars.VTDD_DASHBOARD_ALLOWED_GITHUB_LOGINS }}"),
    true
  );
  assert.equal(workflow.includes("CF_ACCESS_TEAM_DOMAIN: ${{ vars.CF_ACCESS_TEAM_DOMAIN }}"), true);
  assert.equal(workflow.includes("CF_ACCESS_AUD: ${{ vars.CF_ACCESS_AUD }}"), true);
  assert.equal(workflow.includes("[env.production.vars]"), true);
  assert.equal(
    workflow.includes('VTDD_GITHUB_ACTIONS_REPOSITORY = "$VTDD_GITHUB_ACTIONS_REPOSITORY"'),
    true
  );
  assert.equal(workflow.includes("append_toml_var()"), true);
  assert.equal(workflow.includes("JSON.stringify(value)"), true);
  assert.equal(
    workflow.includes('append_toml_var "VTDD_DASHBOARD_ALLOWED_EMAILS" "$VTDD_DASHBOARD_ALLOWED_EMAILS"'),
    true
  );
  assert.equal(
    workflow.includes(
      'append_toml_var "VTDD_DASHBOARD_ALLOWED_GITHUB_LOGINS" "$VTDD_DASHBOARD_ALLOWED_GITHUB_LOGINS"'
    ),
    true
  );
  assert.equal(workflow.includes('append_toml_var "CF_ACCESS_TEAM_DOMAIN" "$CF_ACCESS_TEAM_DOMAIN"'), true);
  assert.equal(workflow.includes('append_toml_var "CF_ACCESS_AUD" "$CF_ACCESS_AUD"'), true);
  assert.equal(workflow.includes('if [ -n "$VTDD_KNOWN_GOOD_COMMIT_SHA" ]; then'), true);
  assert.equal(
    workflow.includes('[[ ! "$VTDD_KNOWN_GOOD_COMMIT_SHA" =~ ^[0-9a-fA-F]{40}$ ]]'),
    true
  );
  assert.equal(
    workflow.includes("VTDD_KNOWN_GOOD_COMMIT_SHA must be a 40-character commit SHA."),
    true
  );
  assert.equal(
    workflow.includes('VTDD_KNOWN_GOOD_COMMIT_SHA = "$VTDD_KNOWN_GOOD_COMMIT_SHA"'),
    true
  );
  assert.equal(workflow.includes("[[env.production.d1_databases]]"), true);
  assert.equal(workflow.includes('binding = "VTDD_MEMORY_D1"'), true);
  assert.equal(workflow.includes('database_id = "$CLOUDFLARE_D1_DATABASE_ID"'), true);
  assert.equal(
    workflow.includes("command: deploy --config wrangler.production.generated.toml --env production"),
    true
  );
  assert.equal(workflow.includes("Notify deploy completion"), true);
  assert.equal(workflow.includes("Notify dashboard deploy event"), true);
  assert.equal(workflow.includes("/v2/events/github-actions"), true);
  assert.equal(workflow.includes("for attempt in 1 2 3 4 5 6"), true);
  assert.equal(workflow.includes("retrying after Worker propagation delay"), true);
  assert.equal(workflow.includes("deploy remains successful, but dashboard may be stale until the next event"), true);
  assert.equal(workflow.includes("authorization: Bearer ${VTDD_GATEWAY_BEARER_TOKEN}"), true);
  assert.equal(workflow.includes('approvalGrantId'), false);
  assert.equal(workflow.includes("if: always()"), true);
  assert.equal(
    workflow.includes("DEPLOY_NOTIFICATION_ISSUE_NUMBER: ${{ vars.VTDD_DEPLOY_NOTIFICATION_ISSUE_NUMBER }}"),
    true
  );
  assert.equal(
    workflow.includes('VTDD_DEPLOY_NOTIFICATION_ISSUE_NUMBER is not set; skipping GitHub mention notification.'),
    true
  );
  assert.equal(
    workflow.includes('[[ ! "$DEPLOY_NOTIFICATION_ISSUE_NUMBER" =~ ^[0-9]+$ ]]'),
    true
  );
  assert.equal(workflow.includes("@${REPOSITORY_OWNER} deploy-production finished"), true);
  assert.equal(workflow.includes("- Run: ${RUN_URL}"), true);
  assert.equal(
    workflow.includes("No approval grant id, token, or secret value is included."),
    true
  );
  assert.equal(
    workflow.includes("repos/${REPOSITORY}/issues/${DEPLOY_NOTIFICATION_ISSUE_NUMBER}/comments"),
    true
  );
  assert.equal(workflow.includes("approval_grant_id=${{"), false);
});

test("wrangler config fixes worker runtime entry and production environment", () => {
  const wrangler = fs.readFileSync(WRANGLER_PATH, "utf8");
  assert.equal(wrangler.includes('main = "worker.js"'), true);
  assert.equal(wrangler.includes("[env.production]"), true);
  assert.equal(wrangler.includes('name = "vtdd-v2-mvp"'), true);
  assert.equal(wrangler.includes(OWNER_D1_DATABASE_ID), false);
  assert.equal(wrangler.includes("database_id"), false);
});

test("owner-specific wrangler config files are ignored", () => {
  const gitignore = fs.readFileSync(GITIGNORE_PATH, "utf8");
  assert.equal(gitignore.includes("wrangler.local.toml"), true);
  assert.equal(gitignore.includes("wrangler.*.local.toml"), true);
  assert.equal(gitignore.includes("wrangler.production.generated.toml"), true);
});
