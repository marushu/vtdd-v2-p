# Issue #741 Live Passkey Boundary E2E

## Purpose

Issue #741 の production live E2E は、owner device に登録された passkey の WebAuthn assertion が必要な箇所で mac Codex / VPS Codex CLI から完走できない。この E2E は、その手前までの production truth を自動取得し、停止理由を `blocked_on_owner_passkey_assertion` として明確に残す。

この E2E は passkey を迂回しない。approvalGrantId を作成・偽造しない。helper queue、root/helper execution、VPS restart、deploy、credential mutation、permission mutation は実行しない。

## Command

```bash
VTDD_GATEWAY_BEARER_TOKEN=... \
node scripts/e2e-issue741-live-passkey-boundary.mjs \
  --runtime-url https://vtdd-v2-mvp.polished-tree-da7c.workers.dev \
  --repository marushu/vtdd-v2-p \
  --issue-number 741 \
  --execution-id issue741-live-e2e-$(date +%Y%m%d%H%M%S)
```

## Expected Result

The command exits successfully when production reaches the passkey boundary:

- Worker `/health` returns ok.
- A no-op `review` VPS maintenance proposal is created for Issue #741.
- The proposal runtime truth reports `approval_required`.
- The proposal runtime truth reports `rootExecutionStarted=false`.
- A passkey challenge can be created for the stored `vpsProposalId`.
- The challenge summary reports `sessionIdPresent=true`, `optionsPresent=true`, and `allowCredentials >= 1`.
- The actual operator HTML includes `isVpsHelperQueueHandoffLaunchAcknowledged`.
- The actual operator HTML includes `queue 保存完了ではありません`.
- The actual operator HTML includes `これは完了結果ではありません`.
- The actual operator HTML does not include the old broad `queued_for_vps_helper_execution || sent_to_bridge` success condition.
- The final boundary is `blocked_on_owner_passkey_assertion`.

## Evidence Format

The runner prints Markdown with sections:

- `Health`
- `Proposal`
- `Passkey Challenge`
- `Operator HTML`
- `Boundary`

The output must not include bearer tokens, raw challenge values, session IDs, approvalGrantId, or secret material.

## Completion Boundary

This E2E does not satisfy full Butler Completion Gate for Issue #741 by itself. It proves that production reaches the real passkey boundary and that PR #831's launch acknowledged operator behavior is deployed.

Full Issue #741 completion still requires owner-device passkey assertion, Dashboard Butler continuation POST, app-server bridge local queue persistence, VPS runner pickup, terminal runtime truth, and mapped owner-facing evidence.
