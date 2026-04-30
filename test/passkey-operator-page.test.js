import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { renderPasskeyOperatorPage } from "../src/core/index.js";

test("passkey operator page can target explicit api base and sync endpoint", () => {
  const html = renderPasskeyOperatorPage({
    apiBase: "/api",
    syncApiBase: "http://127.0.0.1:8789/api",
    actionType: "deploy_production",
    repositoryInput: "marushu/vtdd-v2-p",
    issueNumber: 15,
    highRiskKind: "github_app_secret_sync",
    returnUrl: "https://chatgpt.com/g/example-butler",
    syncEnabled: true
  });

  assert.equal(html.includes('fetch("/api/approval/passkey/challenge"'), true);
  assert.equal(html.includes('fetch("http://127.0.0.1:8789/api/github-app-secret-sync/execute"'), true);
  assert.equal(html.includes('fetch("/api/action/deploy"'), true);
  assert.equal(html.includes('fetch("/api/action/github-authority"'), true);
  assert.equal(html.includes('fetch("/api/action/github-actions-secret"'), true);
  assert.equal(html.includes("readResponseBody"), true);
  assert.equal(html.includes("non_json_response"), true);
  assert.equal(html.includes("Sync GitHub App secrets"), true);
  assert.equal(html.includes("Sync OPENAI_API_KEY"), true);
  assert.equal(html.includes("Dispatch production deploy"), true);
  assert.equal(html.includes("Dispatch PR merge"), true);
  assert.equal(html.includes("Open deploy run"), true);
  assert.equal(html.includes("Open pull request"), true);
  assert.equal(html.includes("Return to Butler"), true);
  assert.equal(html.includes('href="https://chatgpt.com/g/example-butler"'), true);
  assert.equal(html.includes("Butler 会話に貼らず"), true);
  assert.equal(html.includes("Copy approvalGrantId"), true);
  assert.equal(html.includes("Auto-copy approvalGrantId after approval"), true);
  assert.equal(html.includes('id="action-type-input" value="deploy_production"'), true);
  assert.equal(html.includes('repositoryInput: document.getElementById("repo-input").value'), true);
  assert.equal(html.includes('issueNumber: Number(document.getElementById("issue-input").value || 0) || null'), true);
});

test("passkey operator page pre-fills PR merge fields from URL input", () => {
  const html = renderPasskeyOperatorPage({
    repositoryInput: "marushu/vtdd-v2-p",
    issueNumber: 125,
    pullNumber: 148,
    phase: "execution",
    actionType: "merge",
    highRiskKind: "pull_merge",
    mergeMethod: "squash"
  });

  assert.equal(html.includes('id="repo-input" value="marushu/vtdd-v2-p"'), true);
  assert.equal(html.includes('id="issue-input" value="125"'), true);
  assert.equal(html.includes('id="pull-number-input" value="148"'), true);
  assert.equal(html.includes('id="action-type-input" value="merge"'), true);
  assert.equal(html.includes('id="risk-kind-input" value="pull_merge"'), true);
  assert.equal(html.includes('id="merge-method-input" value="squash"'), true);
  assert.equal(html.includes('operation: "pull_merge"'), true);
});

test("passkey operator page focuses deploy mode on deploy approval and dispatch sections", () => {
  const html = renderPasskeyOperatorPage({
    repositoryInput: "marushu/vtdd-v2-p",
    phase: "execution",
    actionType: "deploy_production",
    highRiskKind: "deploy_production",
    returnUrl: "https://chatgpt.com/g/example-butler"
  });

  assert.equal(html.includes('<section data-operator-section="registration">'), true);
  assert.equal(html.includes('<section data-operator-section="approval">'), true);
  assert.equal(html.includes('<section data-operator-section="production-deploy">'), true);
  assert.equal(html.includes('<section data-operator-section="pr-merge" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="github-app-secret-sync" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="github-actions-secret-sync" hidden>'), true);
  assert.equal(html.includes("Dispatch production deploy"), true);
  assert.equal(html.includes("Return to Butler"), true);
});

test("passkey operator page fills safe approval defaults from explicit mode", () => {
  const deployHtml = renderPasskeyOperatorPage({
    operatorMode: "deploy",
    repositoryInput: "marushu/vtdd-v2-p"
  });

  assert.equal(deployHtml.includes('id="action-type-input" value="deploy_production"'), true);
  assert.equal(deployHtml.includes('id="risk-kind-input" value="deploy_production"'), true);
  assert.equal(deployHtml.includes('<section data-operator-section="production-deploy">'), true);

  const mergeHtml = renderPasskeyOperatorPage({
    operatorMode: "merge",
    repositoryInput: "marushu/vtdd-v2-p",
    pullNumber: 148
  });

  assert.equal(mergeHtml.includes('id="action-type-input" value="merge"'), true);
  assert.equal(mergeHtml.includes('id="risk-kind-input" value="pull_merge"'), true);
  assert.equal(mergeHtml.includes('<section data-operator-section="pr-merge">'), true);
});

test("passkey operator page focuses merge mode on approval and PR merge sections", () => {
  const html = renderPasskeyOperatorPage({
    repositoryInput: "marushu/vtdd-v2-p",
    pullNumber: 148,
    actionType: "merge",
    highRiskKind: "pull_merge"
  });

  assert.equal(html.includes('<section data-operator-section="registration">'), true);
  assert.equal(html.includes('<section data-operator-section="approval">'), true);
  assert.equal(html.includes('<section data-operator-section="pr-merge">'), true);
  assert.equal(html.includes('<section data-operator-section="production-deploy" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="github-app-secret-sync" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="github-actions-secret-sync" hidden>'), true);
});

test("passkey operator page focuses secret sync modes without hiding the required approval section", () => {
  const githubAppSecretHtml = renderPasskeyOperatorPage({
    repositoryInput: "marushu/vtdd-v2-p",
    actionType: "destructive",
    highRiskKind: "github_app_secret_sync"
  });
  assert.equal(githubAppSecretHtml.includes('<section data-operator-section="approval">'), true);
  assert.equal(githubAppSecretHtml.includes('<section data-operator-section="github-app-secret-sync">'), true);
  assert.equal(githubAppSecretHtml.includes('<section data-operator-section="production-deploy" hidden>'), true);
  assert.equal(githubAppSecretHtml.includes('<section data-operator-section="pr-merge" hidden>'), true);

  const actionsSecretHtml = renderPasskeyOperatorPage({
    repositoryInput: "marushu/vtdd-v2-p",
    actionType: "destructive",
    highRiskKind: "github_actions_secret_sync"
  });
  assert.equal(actionsSecretHtml.includes('<section data-operator-section="approval">'), true);
  assert.equal(actionsSecretHtml.includes('<section data-operator-section="github-actions-secret-sync">'), true);
  assert.equal(actionsSecretHtml.includes('<section data-operator-section="github-app-secret-sync" hidden>'), true);
  assert.equal(actionsSecretHtml.includes('<section data-operator-section="production-deploy" hidden>'), true);
  assert.equal(actionsSecretHtml.includes('<section data-operator-section="pr-merge" hidden>'), true);
});

test("passkey operator page keeps the full maintenance view when no mode is inferred", () => {
  const html = renderPasskeyOperatorPage({ operatorMode: "full" });

  assert.equal(html.includes('<section data-operator-section="github-app-secret-sync">'), true);
  assert.equal(html.includes('<section data-operator-section="production-deploy">'), true);
  assert.equal(html.includes('<section data-operator-section="pr-merge">'), true);
  assert.equal(html.includes('<section data-operator-section="github-actions-secret-sync">'), true);
});

test("passkey operator page keeps sync disabled message when helper endpoint is absent", () => {
  const html = renderPasskeyOperatorPage({
    apiBase: "/v2",
    syncEnabled: false
  });

  assert.equal(html.includes("desktop maintenance required"), true);
  assert.equal(html.includes("disabled"), true);
});

test("passkey operator page response parser reports and redacts non-json failures", async () => {
  const helpers = loadOperatorPageHelpers();

  const htmlFailure = await helpers.readResponseBody(
    new Response("<!DOCTYPE html><p>token=secret-token sk-testsecret</p>", {
      status: 502,
      headers: { "content-type": "text/html" }
    })
  );
  assert.equal(htmlFailure.error, "non_json_response");
  assert.equal(htmlFailure.httpStatus, 502);
  assert.equal(htmlFailure.rawBody.includes("<!DOCTYPE html>"), true);
  assert.equal(htmlFailure.rawBody.includes("secret-token"), false);
  assert.equal(htmlFailure.rawBody.includes("sk-testsecret"), false);

  const malformedJson = await helpers.readResponseBody(
    new Response("{", {
      status: 500,
      headers: { "content-type": "application/json" }
    })
  );
  assert.equal(malformedJson.error, "invalid_json_response");
  assert.equal(malformedJson.rawBody, "{");

  const validJson = await helpers.readResponseBody(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    })
  );
  assert.equal(validJson.ok, true);
});

test("passkey operator page clipboard helper uses navigator clipboard when available", async () => {
  let copied = "";
  const helpers = loadOperatorPageHelpers({
    navigator: {
      clipboard: {
        writeText: async (value) => {
          copied = value;
        }
      }
    }
  });

  await helpers.copyText("approval:test");

  assert.equal(copied, "approval:test");
});

test("passkey operator page clipboard helper falls back to textarea copy", async () => {
  let copied = false;
  let textareaRemoved = false;
  const textarea = {
    value: "",
    style: {},
    setAttribute() {},
    select() {
      copied = this.value === "approval:fallback";
    }
  };
  const helpers = loadOperatorPageHelpers({
    navigator: {},
    document: {
      getElementById() {
        return {
          value: "",
          textContent: "",
          addEventListener() {}
        };
      },
      createElement(tagName) {
        assert.equal(tagName, "textarea");
        return textarea;
      },
      execCommand(command) {
        assert.equal(command, "copy");
        return copied;
      },
      body: {
        appendChild(element) {
          assert.equal(element, textarea);
        },
        removeChild(element) {
          assert.equal(element, textarea);
          textareaRemoved = true;
        }
      }
    }
  });

  await helpers.copyText("approval:fallback");

  assert.equal(copied, true);
  assert.equal(textareaRemoved, true);
});

test("passkey operator page exposes deploy run link from dispatch response", () => {
  const deployRunLink = {
    href: "#",
    hidden: true
  };
  const helpers = loadOperatorPageHelpers({
    document: {
      getElementById(id) {
        if (id === "deploy-run-link") {
          return deployRunLink;
        }
        return {
          value: "",
          textContent: "",
          addEventListener() {}
        };
      }
    }
  });

  helpers.showDeployRunLink({
    ok: true,
    deploy: {
      runUrl: "https://github.com/sample-org/vtdd-v2-p/actions/runs/123456"
    }
  });

  assert.equal(deployRunLink.href, "https://github.com/sample-org/vtdd-v2-p/actions/runs/123456");
  assert.equal(deployRunLink.hidden, false);

  helpers.clearDeployRunLink();
  assert.equal(deployRunLink.href, "#");
  assert.equal(deployRunLink.hidden, true);
});

test("passkey operator page rejects unsafe or missing deploy run links", () => {
  const deployRunLink = {
    href: "#",
    hidden: true
  };
  const helpers = loadOperatorPageHelpers({
    document: {
      getElementById(id) {
        if (id === "deploy-run-link") {
          return deployRunLink;
        }
        return {
          value: "",
          textContent: "",
          addEventListener() {}
        };
      }
    }
  });

  helpers.showDeployRunLink({
    ok: true,
    deploy: {
      runUrl: "https://evil.example/actions/runs/123456"
    }
  });
  assert.equal(deployRunLink.href, "#");
  assert.equal(deployRunLink.hidden, true);

  helpers.showDeployRunLink({
    ok: true,
    runUrl: "https://github.com/sample-org/vtdd-v2-p/actions/runs/123456"
  });
  assert.equal(deployRunLink.href, "#");
  assert.equal(deployRunLink.hidden, true);
});

test("passkey operator page exposes safe PR link from merge response", () => {
  const mergePrLink = {
    href: "#",
    hidden: true
  };
  const helpers = loadOperatorPageHelpers({
    document: {
      getElementById(id) {
        if (id === "merge-pr-link") {
          return mergePrLink;
        }
        return {
          value: "",
          textContent: "",
          addEventListener() {}
        };
      }
    }
  });

  helpers.showMergePrLink({
    ok: true,
    authorityAction: {
      htmlUrl: "https://github.com/sample-org/vtdd-v2-p/pull/148"
    }
  });

  assert.equal(mergePrLink.href, "https://github.com/sample-org/vtdd-v2-p/pull/148");
  assert.equal(mergePrLink.hidden, false);

  helpers.clearMergePrLink();
  assert.equal(mergePrLink.href, "#");
  assert.equal(mergePrLink.hidden, true);

  helpers.showMergePrLink({
    ok: true,
    authorityAction: {
      htmlUrl: "https://evil.example/sample-org/vtdd-v2-p/pull/148"
    }
  });
  assert.equal(mergePrLink.href, "#");
  assert.equal(mergePrLink.hidden, true);
});

function loadOperatorPageHelpers(overrides = {}) {
  const html = renderPasskeyOperatorPage();
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(script);

  const elements = new Map();
  const context = {
    Response,
    URL,
    navigator: {},
    document: {
      getElementById(id) {
        if (!elements.has(id)) {
          elements.set(id, {
            value: "",
            textContent: "",
            addEventListener() {}
          });
        }
        return elements.get(id);
      }
    },
    ...overrides
  };
  vm.runInNewContext(script, context);
  assert.equal(typeof context.readResponseBody, "function");
  return context;
}
