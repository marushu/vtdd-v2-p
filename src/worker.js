import {
  retrieveConstitution,
  runInitialSetupWizard,
  runMvpGateway,
  validateMemoryProvider
} from "./core/index.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8"
};

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8"
};

const DEFAULT_REPOSITORIES = Object.freeze([
  {
    canonicalRepo: "marushu/vtdd-v2",
    aliases: ["vtdd", "vtdd-v2"]
  }
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json(200, {
        ok: true,
        service: "vtdd-v2-worker",
        mode: "mvp"
      });
    }

    if (request.method === "GET" && url.pathname === "/setup/wizard") {
      return handleSetupWizardRequest(url);
    }

    if (request.method === "POST" && url.pathname === "/mvp/gateway") {
      const auth = authorizeGatewayRequest({ request, env });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      const payload = await readJson(request);
      const result = runMvpGateway(payload);
      return json(result.allowed ? 200 : 422, result);
    }

    if (request.method === "GET" && url.pathname === "/mvp/retrieve/constitution") {
      const auth = authorizeGatewayRequest({ request, env });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleRetrieveConstitutionRequest(url, env);
    }

    return json(404, {
      ok: false,
      error: "not_found"
    });
  }
};

function handleSetupWizardRequest(url) {
  const answers = buildSetupWizardAnswers(url);
  const result = runInitialSetupWizard({ answers });
  const format = normalize(url.searchParams.get("format"));

  if (format === "json") {
    return json(result.ok ? 200 : 422, {
      ...result,
      generatedAnswers: answers
    });
  }

  const htmlBody = renderSetupWizardHtml({ result, answers, url });
  return html(result.ok ? 200 : 422, htmlBody);
}

async function handleRetrieveConstitutionRequest(url, env) {
  const provider = env?.MEMORY_PROVIDER ?? null;
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return json(503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for constitution retrieval"
    });
  }

  const limit = normalizeLimit(url.searchParams.get("limit"), 5);
  const records = await retrieveConstitution(provider, limit);
  return json(200, {
    ok: true,
    recordType: "constitution",
    recordCount: records.length,
    records
  });
}

function buildSetupWizardAnswers(url) {
  const repositories = parseRepositories(url);
  const initialSurfaces = parseInitialSurfaces(url);
  const actionEndpointBaseUrl = normalizeUrl(url.searchParams.get("actionEndpointBaseUrl")) || url.origin;

  return {
    repositories,
    allowDefaultRepository: false,
    credentialModel: "github_app",
    highRiskApproval: "go_passkey",
    reviewerInitial: "gemini",
    setupMode: "iphone_first",
    actionEndpointBaseUrl,
    initialSurfaces
  };
}

function parseRepositories(url) {
  const provided = url.searchParams
    .getAll("repo")
    .map(normalizeRepo)
    .filter(Boolean);

  if (provided.length === 0) {
    return DEFAULT_REPOSITORIES.map((item) => ({
      canonicalRepo: item.canonicalRepo,
      aliases: [...item.aliases]
    }));
  }

  return provided.map((canonicalRepo) => ({
    canonicalRepo,
    aliases: deriveAliases(canonicalRepo)
  }));
}

function parseInitialSurfaces(url) {
  const surfaces = url.searchParams
    .getAll("surface")
    .map(normalize)
    .filter(Boolean);

  return surfaces.length > 0 ? surfaces : ["custom_gpt"];
}

function deriveAliases(canonicalRepo) {
  const [, repoNameRaw] = canonicalRepo.split("/");
  const repoName = String(repoNameRaw ?? "").trim().toLowerCase();
  const compact = repoName.replace(/[^a-z0-9]+/g, "");
  const aliases = new Set([repoName, compact].filter(Boolean));
  return [...aliases];
}

function renderSetupWizardHtml({ result, answers, url }) {
  const body = result.ok
    ? renderSuccessContent(result, answers, url)
    : renderFailureContent(result, answers, url);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>VTDD Setup Wizard</title>
    <style>
      :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        padding: 20px;
        background: #f4f6fb;
        color: #152033;
      }
      main {
        max-width: 860px;
        margin: 0 auto;
        background: #ffffff;
        border-radius: 14px;
        padding: 20px;
        box-shadow: 0 6px 24px rgba(14, 30, 52, 0.12);
      }
      h1 {
        font-size: 24px;
        margin: 0 0 12px;
      }
      h2 {
        font-size: 18px;
        margin: 18px 0 10px;
      }
      .section-header {
        margin-top: 18px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      p {
        margin: 8px 0;
        line-height: 1.5;
      }
      ul {
        margin: 10px 0;
        padding-left: 18px;
      }
      li {
        margin: 4px 0;
      }
      .meta {
        font-size: 14px;
        color: #4b5a73;
      }
      .block {
        background: #f8fbff;
        border: 1px solid #d8e6ff;
        border-radius: 10px;
        padding: 12px;
      }
      textarea {
        width: 100%;
        min-height: 180px;
        border-radius: 8px;
        border: 1px solid #c4d7f7;
        padding: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
      }
      .copy-button {
        border: 1px solid #8eb0f8;
        background: #edf4ff;
        color: #1e4ca6;
        font-size: 12px;
        font-weight: 600;
        border-radius: 8px;
        padding: 6px 10px;
      }
      .copy-hint {
        font-size: 12px;
        color: #4b5a73;
      }
      code {
        background: #eef3ff;
        padding: 2px 5px;
        border-radius: 5px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>VTDD Setup Wizard</h1>
      ${body}
    </main>
    <script>
      function setCopyState(button, message) {
        const targetId = button.getAttribute("data-copy-target");
        const status = document.querySelector('[data-copy-status="' + targetId + '"]');
        if (status) {
          status.textContent = message;
        }
      }

      async function copyFromTextarea(button) {
        const targetId = button.getAttribute("data-copy-target");
        const textarea = document.getElementById(targetId);
        if (!textarea) {
          return;
        }

        const value = textarea.value || textarea.textContent || "";
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(value);
          } else {
            textarea.focus();
            textarea.select();
            document.execCommand("copy");
          }
          setCopyState(button, "Copied.");
        } catch {
          textarea.focus();
          textarea.select();
          setCopyState(button, "Select all and copy manually.");
        }
      }

      document.querySelectorAll("[data-copy-target]").forEach((button) => {
        button.addEventListener("click", () => {
          copyFromTextarea(button);
        });
      });
    </script>
  </body>
</html>`;
}

function renderSuccessContent(result, answers, url) {
  const onboarding = result.onboarding ?? {};
  const customGpt = onboarding.customGpt ?? {};
  const repoList = answers.repositories.map((item) => escapeHtml(item.canonicalRepo));
  const steps = Array.isArray(onboarding.steps) ? onboarding.steps : [];
  const actionSchemaJson = customGpt.actionSchemaJson ?? "";
  const constructionText = customGpt.constructionText ?? "";

  return `
    <p class="meta">Open this URL on iPhone Safari, then copy the blocks below into Custom GPT settings.</p>
    <p class="meta">JSON output: <code>${escapeHtml(`${url.origin}/setup/wizard?format=json`)}</code></p>
    <h2>Repositories</h2>
    <div class="block">
      <ul>${repoList.map((repo) => `<li>${repo}</li>`).join("")}</ul>
    </div>
    <h2>Checklist</h2>
    <div class="block">
      <ul>${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ul>
    </div>
    <div class="section-header">
      <h2>Custom GPT Construction</h2>
      <button class="copy-button" type="button" data-copy-target="constructionText">Copy Construction</button>
    </div>
    <textarea id="constructionText" readonly>${escapeHtml(constructionText)}</textarea>
    <p class="copy-hint" data-copy-status="constructionText">Tap copy button if text selection is difficult on mobile.</p>
    <div class="section-header">
      <h2>Custom GPT Action Schema (OpenAPI)</h2>
      <button class="copy-button" type="button" data-copy-target="actionSchemaJson">Copy Schema</button>
    </div>
    <textarea id="actionSchemaJson" readonly>${escapeHtml(actionSchemaJson)}</textarea>
    <p class="copy-hint" data-copy-status="actionSchemaJson">Tap copy button to copy full OpenAPI JSON.</p>
    <p class="meta">Secrets are not handled here. Keep Cloudflare credentials in GitHub Environment secrets only.</p>
  `;
}

function renderFailureContent(result, answers, url) {
  const issues = Array.isArray(result.blockingIssues) ? result.blockingIssues : [];
  const issueItems = issues.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  return `
    <p class="meta">Wizard validation failed.</p>
    <h2>Blocking Issues</h2>
    <div class="block">
      <ul>${issueItems || "<li>unknown validation error</li>"}</ul>
    </div>
    <h2>Debug (safe answers only)</h2>
    <textarea readonly>${escapeHtml(JSON.stringify(answers, null, 2))}</textarea>
    <p class="meta">Tip: use <code>${escapeHtml(`${url.origin}/setup/wizard?format=json`)}</code> to inspect machine-readable output.</p>
  `;
}

function authorizeGatewayRequest({ request, env }) {
  const runtimeEnv = env ?? {};

  const bearerToken = normalizeText(runtimeEnv.MVP_GATEWAY_BEARER_TOKEN);
  if (bearerToken) {
    const provided = parseBearerToken(request.headers.get("authorization"));
    if (provided === bearerToken) {
      return { ok: true };
    }
    return {
      ok: false,
      status: 401,
      reason: "valid bearer token is required for /mvp/gateway"
    };
  }

  const accessClientId = normalizeText(runtimeEnv.CF_ACCESS_CLIENT_ID);
  const accessClientSecret = normalizeText(runtimeEnv.CF_ACCESS_CLIENT_SECRET);
  if (accessClientId || accessClientSecret) {
    const providedId = normalizeText(request.headers.get("cf-access-client-id"));
    const providedSecret = normalizeText(request.headers.get("cf-access-client-secret"));
    if (
      accessClientId &&
      accessClientSecret &&
      providedId === accessClientId &&
      providedSecret === accessClientSecret
    ) {
      return { ok: true };
    }
    return {
      ok: false,
      status: 401,
      reason: "valid Cloudflare Access service token headers are required for /mvp/gateway"
    };
  }

  return { ok: true };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizeLimit(value, fallback) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(numeric), 200);
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}

function html(status, body) {
  return new Response(body, {
    status,
    headers: HTML_HEADERS
  });
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function parseBearerToken(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }

  const [scheme, token] = text.split(/\s+/, 2);
  if (normalize(scheme) !== "bearer") {
    return "";
  }
  return normalizeText(token);
}

function normalizeRepo(value) {
  const repo = normalize(value);
  if (!repo || !repo.includes("/")) {
    return "";
  }
  return repo;
}

function normalizeUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  try {
    const parsed = new URL(text);
    return parsed.origin;
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
