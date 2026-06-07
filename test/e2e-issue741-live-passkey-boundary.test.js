import assert from "node:assert/strict";
import test from "node:test";

import {
  assertOperatorHtml,
  buildProposalPayload,
  formatPasskeyBoundaryMarkdown,
  runLivePasskeyBoundaryE2e,
  sanitizeText,
  summarizeChallenge
} from "../scripts/e2e-issue741-live-passkey-boundary.mjs";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function textResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

test("Issue #741 live passkey boundary runner validates proposal, challenge, and operator markers", async () => {
  const calls = [];
  const operatorHtml = `
    <script>
      function isVpsHelperQueueHandoffLaunchAcknowledged(body) {
        const runtimeStatus = String(body?.execution?.runtimeTruth?.status || body?.runtimeTruth?.status || "");
        if (runtimeStatus !== "vps_local_helper_queue_control_sent") return false;
      }
      function buildVpsHelperQueueLaunchAcknowledgedText(body) {
        return "VPS helper queue への引き渡し要求を app-server bridge へ送りました。これは queue 保存完了ではありません。Dashboard Butler と通知で local queue の保存結果を確認してください。";
      }
      const fallback = "VPS helper queue handoff の起動応答を受け取りました。これは完了結果ではありません。Dashboard Butler と通知で local queue の保存結果を確認してください。";
    </script>
  `;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/health")) {
      return jsonResponse({ ok: true, service: "vtdd-v2-worker", mode: "v2" });
    }
    if (String(url).endsWith("/v2/vps/privileged-maintenance/proposals")) {
      const payload = JSON.parse(init.body);
      assert.equal(payload.operation, "review");
      assert.equal(payload.id, "issue741.live-e2e.noop");
      return jsonResponse({
        ok: true,
        vpsProposalId: "vps-maintenance-proposal:test",
        approvalOperatorUrl: "https://example.test/operator",
        runtimeTruth: {
          status: "approval_required",
          rootExecutionStarted: false,
          capabilityId: "issue741.live-e2e.noop"
        }
      });
    }
    if (String(url).endsWith("/v2/approval/passkey/challenge")) {
      const payload = JSON.parse(init.body);
      assert.equal(payload.vpsProposalId, "vps-maintenance-proposal:test");
      return jsonResponse({
        ok: true,
        sessionId: "session-secret-must-not-render",
        optionsJSON: {
          rpId: "example.test",
          challenge: "challenge-secret-must-not-render",
          allowCredentials: [{ id: "credential-id" }]
        }
      });
    }
    if (String(url) === "https://example.test/operator") {
      return textResponse(operatorHtml);
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const result = await runLivePasskeyBoundaryE2e({
    runtimeUrl: "https://example.test",
    repository: "marushu/vtdd-v2-p",
    issueNumber: 741,
    gatewayBearerToken: "test-token",
    executionId: "issue741-live-test",
    fetchImpl
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "blocked_on_owner_passkey_assertion");
  assert.equal(result.proposal.rootExecutionStarted, false);
  assert.equal(result.challenge.sessionIdPresent, true);
  assert.equal(result.challenge.allowCredentials, 1);
  assert.equal(result.operator.ok, true);
  assert.equal(calls.length, 4);

  const markdown = formatPasskeyBoundaryMarkdown(result);
  assert.match(markdown, /PASS_TO_PASSKEY_BOUNDARY/);
  assert.match(markdown, /blocked_on_owner_passkey_assertion/);
  assert.match(markdown, /approvalGrantId was not created or forged/);
  assert.doesNotMatch(markdown, /session-secret-must-not-render/);
  assert.doesNotMatch(markdown, /challenge-secret-must-not-render/);
  assert.doesNotMatch(markdown, /test-token/);
});

test("Issue #741 operator marker assertion rejects old broad queue success markers", () => {
  const html = `
    function isVpsHelperQueueHandoffLaunchAcknowledged(body) {}
    if (runtimeStatus !== "vps_local_helper_queue_control_sent") return false;
    return "VPS helper queue への引き渡し要求を app-server bridge へ送りました。これは queue 保存完了ではありません。";
    return "これは完了結果ではありません";
    if (executionStatus === "queued_for_vps_helper_execution" || executionStatus === "sent_to_bridge") return true;
  `;
  const result = assertOperatorHtml(html);
  assert.equal(result.ok, false);
  assert.equal(result.forbidden.some((item) => item.present), true);
});

test("Issue #741 live passkey boundary helpers summarize without secret payloads", () => {
  const proposal = buildProposalPayload({
    repository: "marushu/vtdd-v2-p",
    issueNumber: 741,
    host: "x85-131-245-163",
    executionId: "issue741-live-test"
  });
  assert.equal(proposal.operation, "review");
  assert.deepEqual(proposal.allowedArgs, ["true"]);
  assert.deepEqual(proposal.affectedPaths, ["none"]);

  const challenge = summarizeChallenge({
    ok: true,
    sessionId: "session-secret",
    optionsJSON: {
      rpId: "vtdd.example",
      challenge: "raw-challenge",
      allowCredentials: [{ id: "credential" }]
    }
  });
  assert.deepEqual(challenge, {
    ok: true,
    sessionIdPresent: true,
    optionsPresent: true,
    rpId: "vtdd.example",
    allowCredentials: 1
  });

  assert.equal(sanitizeText("authorization: Bearer abc.def token=secret"), "authorization: Bearer [REDACTED] token=[REDACTED]");
});
