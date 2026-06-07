#!/usr/bin/env node

import fs from "node:fs/promises";

const DEFAULT_RUNTIME_URL = "https://vtdd-v2-mvp.polished-tree-da7c.workers.dev";
const DEFAULT_HOST = "x85-131-245-163";
const REQUIRED_OPERATOR_MARKERS = [
  "isVpsHelperQueueHandoffLaunchAcknowledged",
  "runtimeStatus !== \"vps_local_helper_queue_control_sent\"",
  "VPS helper queue への引き渡し要求を app-server bridge へ送りました。これは queue 保存完了ではありません。",
  "これは完了結果ではありません"
];
const FORBIDDEN_OPERATOR_MARKERS = [
  "executionStatus === \"queued_for_vps_helper_execution\" || executionStatus === \"sent_to_bridge\"",
  "queueStatus === \"queued\"",
  "vps_local_helper_queue_queued",
  "VPS helper queue へ渡しました。Dashboard Butler"
];

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
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

function buildProposalPayload({ repository, issueNumber, host, executionId }) {
  return {
    host,
    repository,
    relatedIssue: issueNumber,
    operation: "review",
    id: "issue741.live-e2e.noop",
    title: "Issue #741 live E2E no-op review",
    commandClass: "noop_review_only",
    riskLevel: "high",
    workingDirectories: ["/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p"],
    allowedArgs: ["true"],
    affectedPaths: ["none"],
    redactionRules: ["no secrets"],
    rollbackPlan: "no runtime mutation; proposal expires without helper execution",
    expectedRuntimeTruth: ["proposal created", "passkey challenge available", "no root execution"],
    reason: "Issue #741 production live E2E boundary check after deploy",
    impactScope: "no runtime mutation; approval proposal only",
    dashboardThreadId: `dashboard-main-${repository.replace("/", "-")}`,
    executionId
  };
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    return {
      ok: false,
      error: "invalid_json_response",
      reason: String(error),
      rawBodyPreview: sanitizeText(text).slice(0, 240)
    };
  }
}

function sanitizeText(value) {
  return String(value || "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [REDACTED]")
    .replace(/(api[_-]?key|token|secret|sessionId|challenge)([ \t]*[:=][ \t]*|[ \t]+)([^"'\s<>&,}]+)/gi, "$1$2[REDACTED]");
}

function assertOperatorHtml(html) {
  const required = REQUIRED_OPERATOR_MARKERS.map((marker) => ({
    marker,
    present: html.includes(marker)
  }));
  const forbidden = FORBIDDEN_OPERATOR_MARKERS.map((marker) => ({
    marker,
    present: html.includes(marker)
  }));
  return {
    ok: required.every((item) => item.present) && forbidden.every((item) => !item.present),
    required,
    forbidden
  };
}

function summarizeChallenge(body) {
  return {
    ok: body?.ok === true,
    sessionIdPresent: Boolean(body?.sessionId),
    optionsPresent: Boolean(body?.optionsJSON),
    rpId: normalizeText(body?.optionsJSON?.rpId),
    allowCredentials: Array.isArray(body?.optionsJSON?.allowCredentials)
      ? body.optionsJSON.allowCredentials.length
      : null
  };
}

async function runLivePasskeyBoundaryE2e(options = {}) {
  const runtimeUrl = normalizeText(options.runtimeUrl) || DEFAULT_RUNTIME_URL;
  const repository = normalizeText(options.repository) || "marushu/vtdd-v2-p";
  const issueNumber = Number(options.issueNumber || 741);
  const host = normalizeText(options.host) || DEFAULT_HOST;
  const token = normalizeText(options.gatewayBearerToken || process.env.VTDD_GATEWAY_BEARER_TOKEN);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const executionId = normalizeText(options.executionId) || `issue741-live-e2e-${Date.now()}`;
  const origin = runtimeUrl.replace(/\/+$/, "");
  const headers = token
    ? { authorization: `Bearer ${token}`, "content-type": "application/json" }
    : { "content-type": "application/json" };

  if (typeof fetchImpl !== "function") {
    throw new Error("fetch implementation is required");
  }
  if (!token) {
    throw new Error("VTDD_GATEWAY_BEARER_TOKEN is required for production proposal/challenge boundary E2E");
  }

  const healthResponse = await fetchImpl(`${origin}/health`);
  const healthBody = await readJson(healthResponse);

  const proposalPayload = buildProposalPayload({ repository, issueNumber, host, executionId });
  const proposalResponse = await fetchImpl(`${origin}/v2/vps/privileged-maintenance/proposals`, {
    method: "POST",
    headers,
    body: JSON.stringify(proposalPayload)
  });
  const proposalBody = await readJson(proposalResponse);
  const vpsProposalId = normalizeText(proposalBody?.vpsProposalId);
  const operatorUrl = normalizeText(proposalBody?.approvalOperatorUrl);

  let challengeSummary = { ok: false, skipped: true };
  if (vpsProposalId) {
    const challengePayload = {
      phase: "execution",
      highRiskKind: "vps_runner_admin",
      repositoryInput: repository,
      issueNumber,
      vpsProposalId,
      policyInput: {
        actionType: "destructive",
        repositoryInput: repository,
        highRiskKind: "vps_runner_admin",
        vpsProposalId
      }
    };
    const challengeResponse = await fetchImpl(`${origin}/v2/approval/passkey/challenge`, {
      method: "POST",
      headers,
      body: JSON.stringify(challengePayload)
    });
    challengeSummary = {
      httpStatus: challengeResponse.status,
      ...summarizeChallenge(await readJson(challengeResponse))
    };
  }

  let operatorSummary = { ok: false, skipped: true };
  if (operatorUrl) {
    const operatorResponse = await fetchImpl(operatorUrl);
    const operatorHtml = await operatorResponse.text();
    operatorSummary = {
      httpStatus: operatorResponse.status,
      contentLength: operatorHtml.length,
      ...assertOperatorHtml(operatorHtml)
    };
  }

  const result = {
    ok:
      healthResponse.ok &&
      healthBody?.ok === true &&
      proposalResponse.ok &&
      proposalBody?.ok === true &&
      proposalBody?.runtimeTruth?.rootExecutionStarted === false &&
      challengeSummary.ok === true &&
      challengeSummary.sessionIdPresent === true &&
      challengeSummary.optionsPresent === true &&
      operatorSummary.ok === true,
    status: "blocked_on_owner_passkey_assertion",
    runtimeUrl: origin,
    repository,
    issueNumber,
    executionId,
    health: {
      httpStatus: healthResponse.status,
      ok: healthBody?.ok === true,
      service: healthBody?.service,
      mode: healthBody?.mode
    },
    proposal: {
      httpStatus: proposalResponse.status,
      ok: proposalBody?.ok === true,
      error: proposalBody?.error,
      issues: proposalBody?.issues,
      vpsProposalId,
      runtimeStatus: proposalBody?.runtimeTruth?.status,
      rootExecutionStarted: proposalBody?.runtimeTruth?.rootExecutionStarted,
      capabilityId: proposalBody?.runtimeTruth?.capabilityId,
      operatorUrl
    },
    challenge: challengeSummary,
    operator: operatorSummary,
    boundary: {
      status: "blocked_on_owner_passkey_assertion",
      reason: "registered owner WebAuthn private key is required for navigator.credentials.get() and approval verify",
      bypassAttempted: false,
      helperExecutionStarted: false,
      rootExecutionStarted: false
    }
  };

  return result;
}

function formatPasskeyBoundaryMarkdown(result) {
  const required = result.operator?.required || [];
  const forbidden = result.operator?.forbidden || [];
  const lines = [
    "# Issue #741 Live Passkey Boundary E2E",
    "",
    `- status: ${result.ok ? "PASS_TO_PASSKEY_BOUNDARY" : "FAILED_BEFORE_PASSKEY_BOUNDARY"}`,
    `- boundary: ${result.boundary?.status || "unknown"}`,
    `- runtime: ${result.runtimeUrl}`,
    `- repository: ${result.repository}`,
    `- issue: Issue #${result.issueNumber}`,
    `- executionId: ${result.executionId}`,
    "",
    "## Health",
    "",
    `- HTTP: ${result.health?.httpStatus}`,
    `- ok: ${Boolean(result.health?.ok)}`,
    `- service: ${result.health?.service || ""}`,
    `- mode: ${result.health?.mode || ""}`,
    "",
    "## Proposal",
    "",
    `- HTTP: ${result.proposal?.httpStatus}`,
    `- ok: ${Boolean(result.proposal?.ok)}`,
    `- runtimeStatus: ${result.proposal?.runtimeStatus || ""}`,
    `- vpsProposalId: ${result.proposal?.vpsProposalId || ""}`,
    `- capabilityId: ${result.proposal?.capabilityId || ""}`,
    `- rootExecutionStarted: ${Boolean(result.proposal?.rootExecutionStarted)}`,
    "",
    "## Passkey Challenge",
    "",
    `- ok: ${Boolean(result.challenge?.ok)}`,
    `- HTTP: ${result.challenge?.httpStatus || ""}`,
    `- sessionIdPresent: ${Boolean(result.challenge?.sessionIdPresent)}`,
    `- optionsPresent: ${Boolean(result.challenge?.optionsPresent)}`,
    `- rpId: ${result.challenge?.rpId || ""}`,
    `- allowCredentials: ${result.challenge?.allowCredentials ?? ""}`,
    "",
    "## Operator HTML",
    "",
    `- HTTP: ${result.operator?.httpStatus || ""}`,
    `- contentLength: ${result.operator?.contentLength || 0}`,
    `- markerCheck: ${result.operator?.ok ? "PASS" : "FAIL"}`,
    "",
    "Required markers:",
    ...required.map((item) => `- ${item.present ? "PASS" : "FAIL"} ${item.marker}`),
    "",
    "Forbidden markers:",
    ...forbidden.map((item) => `- ${item.present ? "FAIL" : "PASS"} ${item.marker}`),
    "",
    "## Boundary",
    "",
    "- real WebAuthn assertion is intentionally not automated.",
    "- approvalGrantId was not created or forged.",
    "- helper/root execution was not started.",
    `- reason: ${result.boundary?.reason || ""}`
  ];
  return sanitizeText(lines.join("\n"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const result = await runLivePasskeyBoundaryE2e({
    runtimeUrl: args["runtime-url"],
    repository: args.repository,
    issueNumber: args["issue-number"],
    host: args.host,
    executionId: args["execution-id"],
    gatewayBearerToken: args["gateway-bearer-token"]
  });
  const markdown = formatPasskeyBoundaryMarkdown(result);
  if (args.output) {
    await fs.writeFile(args.output, `${markdown}\n`, "utf8");
  }
  process.stdout.write(`${markdown}\n`);
  process.exit(result.ok ? 0 : 1);
}

export {
  FORBIDDEN_OPERATOR_MARKERS,
  REQUIRED_OPERATOR_MARKERS,
  assertOperatorHtml,
  buildProposalPayload,
  formatPasskeyBoundaryMarkdown,
  runLivePasskeyBoundaryE2e,
  sanitizeText,
  summarizeChallenge
};
