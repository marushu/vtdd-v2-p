import { execFile } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { loadGitHubAppSecretSource, renderPasskeyOperatorPage } from "../src/core/index.js";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const SYNC_SCRIPT_PATH = path.join(SCRIPT_DIR, "sync-github-app-actions-secrets.mjs");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runtimeUrl = normalizeText(args.runtimeUrl || process.env.VTDD_RUNTIME_URL);
  if (!runtimeUrl) {
    throw new Error("--runtime-url or VTDD_RUNTIME_URL is required");
  }

  const sourceResult = await loadGitHubAppSecretSource({
    envPath: args.envPath
  });
  if (!sourceResult.ok) {
    throw new Error(sourceResult.issues.join(", "));
  }
  const bearerToken = normalizeText(
    args.gatewayBearerToken ||
      process.env.VTDD_GATEWAY_BEARER_TOKEN ||
      sourceResult.source.gatewayBearerToken
  );
  if (!bearerToken) {
    throw new Error(
      "gateway bearer token is required via --gateway-bearer-token, VTDD_GATEWAY_BEARER_TOKEN, or load-env.sh"
    );
  }

  const bind = normalizeText(args.bind || "127.0.0.1");
  const port = Number(args.port || 8789);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("port must be a positive number");
  }

  const state = {
    runtimeUrl,
    bearerToken,
    repo: normalizeText(args.repo || "marushu/vtdd-v2-p"),
    issueNumber: normalizeText(args.issueNumber || "15"),
    highRiskKind: normalizeText(args.highRiskKind || "github_app_secret_sync"),
    envPath: normalizeText(args.envPath || sourceResult.source.envPath)
  };

  const server = http.createServer((request, response) =>
    handleRequest({ request, response, state }).catch((error) => {
      writeJson(response, 500, {
        ok: false,
        error: "operator_helper_unhandled_error",
        reason: error instanceof Error ? error.message : String(error)
      });
    })
  );

  await new Promise((resolve) => server.listen(port, bind, resolve));
  const localUrl = `http://${bind}:${port}`;
  console.log(`VTDD passkey operator helper listening on ${localUrl}`);
  console.log(`runtime: ${state.runtimeUrl}`);
  console.log(`repo: ${state.repo}`);
  console.log(`issue: ${state.issueNumber}`);
  console.log("Open the URL above in a browser or on the same network if you intentionally expose it.");
}

async function handleRequest({ request, response, state }) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/") {
    const html = renderPasskeyOperatorPage({
      origin: `${url.protocol}//${url.host}`,
      apiBase: "/api",
      repositoryInput: state.repo,
      issueNumber: state.issueNumber,
      highRiskKind: state.highRiskKind,
      syncEnabled: true
    });
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }

  if (url.pathname.startsWith("/api/approval/passkey/")) {
    await proxyPasskeyApi({ request, response, state, pathname: url.pathname.replace("/api", "/v2") });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/github-app-secret-sync/execute") {
    const body = await readJson(request);
    const approvalGrantId = normalizeText(body.approvalGrantId);
    const repo = normalizeText(body.repositoryInput || state.repo);
    if (!approvalGrantId) {
      writeJson(response, 422, {
        ok: false,
        error: "approval_grant_id_required",
        reason: "approvalGrantId is required"
      });
      return;
    }

    const args = [
      SYNC_SCRIPT_PATH,
      "--repo",
      repo,
      "--execute",
      "--runtime-url",
      state.runtimeUrl,
      "--approval-grant-id",
      approvalGrantId
    ];
    if (state.envPath) {
      args.push("--env-path", state.envPath);
    }

    const result = await execFileAsync(process.execPath, args, {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024
    }).catch((error) => ({
      ok: false,
      stdout: error.stdout || "",
      stderr: error.stderr || "",
      reason: error instanceof Error ? error.message : String(error)
    }));

    if (result.ok === false) {
      writeJson(response, 500, {
        ok: false,
        error: "github_app_secret_sync_failed",
        reason: result.reason,
        stdout: normalizeText(result.stdout),
        stderr: normalizeText(result.stderr)
      });
      return;
    }

    writeJson(response, 200, {
      ok: true,
      stdout: normalizeText(result.stdout),
      stderr: normalizeText(result.stderr)
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/retrieve/approval-grant") {
    const endpoint = new URL("/v2/retrieve/approval-grant", state.runtimeUrl);
    if (url.searchParams.has("approvalId")) {
      endpoint.searchParams.set("approvalId", url.searchParams.get("approvalId"));
    }
    const proxied = await fetch(endpoint, {
      headers: {
        authorization: `Bearer ${state.bearerToken}`
      }
    });
    const body = await proxied.text();
    response.writeHead(proxied.status, {
      "content-type": proxied.headers.get("content-type") || "application/json; charset=utf-8"
    });
    response.end(body);
    return;
  }

  writeJson(response, 404, {
    ok: false,
    error: "not_found"
  });
}

async function proxyPasskeyApi({ request, response, state, pathname }) {
  const endpoint = new URL(pathname, state.runtimeUrl);
  const body =
    request.method === "GET" || request.method === "HEAD" ? undefined : await readBody(request);
  const proxied = await fetch(endpoint, {
    method: request.method,
    headers: {
      authorization: `Bearer ${state.bearerToken}`,
      "content-type": request.headers["content-type"] || "application/json"
    },
    body
  });
  const text = await proxied.text();
  response.writeHead(proxied.status, {
    "content-type": proxied.headers.get("content-type") || "application/json; charset=utf-8"
  });
  response.end(text);
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === "--runtime-url") {
      parsed.runtimeUrl = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--gateway-bearer-token") {
      parsed.gatewayBearerToken = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--repo") {
      parsed.repo = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--issue-number") {
      parsed.issueNumber = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--high-risk-kind") {
      parsed.highRiskKind = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--bind") {
      parsed.bind = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--port") {
      parsed.port = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--env-path") {
      parsed.envPath = args[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function readJson(request) {
  const body = await readBody(request);
  if (body.length === 0) {
    return {};
  }
  return JSON.parse(body.toString("utf8"));
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
