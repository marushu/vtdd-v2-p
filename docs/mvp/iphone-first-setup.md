# iPhone-first Setup (MVP)

This runbook is for starting VTDD V2 from iPhone without local Mac setup.

## Principle

- Keep shared spec and workflow in GitHub.
- Keep user-specific memory in DB.
- Never paste cloud credentials into chats or setup answers.

## Steps

1. Open Safari on iPhone and access setup URL:
   - `https://<your-worker-domain>/setup/wizard`
   - JSON mode (optional): `https://<your-worker-domain>/setup/wizard?format=json`
   - Cloudflare setup diagnostics are opt-in and disabled by default.
2. Open ChatGPT on iPhone and edit the Butler Custom GPT.
3. Copy `Custom GPT Construction` and `Custom GPT Action Schema` from setup page.
4. Ensure GitHub `production` environment has required reviewers enabled.
5. Ensure GitHub has environment secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
6. Configure Worker runtime secret for machine auth (recommended):
   - `VTDD_GATEWAY_BEARER_TOKEN` (Cloudflare Worker secret)
   - set the same token in Custom GPT Action auth (Bearer)
   - fallback mode (if bearer cannot be used): `CF_ACCESS_CLIENT_ID` + `CF_ACCESS_CLIENT_SECRET`
7. Run `deploy-production` workflow with:
   - `approval_phrase=GO`
   - `passkey_verified=true`
8. Approve the production environment gate.

## Optional Query Parameters

- `repo=owner/name` (repeatable): override repository list
- `surface=custom_gpt` (repeatable): override initial surfaces
- `actionEndpointBaseUrl=https://...`: force action schema server URL
- `format=json`: return machine-readable wizard output
- `cloudflareCheck=on`: run Cloudflare setup diagnostics (requires env opt-in below)

## Optional Cloudflare Diagnostics (Opt-in)

- Set Worker runtime env: `SETUP_WIZARD_CLOUDFLARE_CHECK_ENABLED=true`
- Also set Worker secrets:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
- Open wizard with query: `?cloudflareCheck=on`

## Security Boundary

- High-risk actions remain `GO + passkey`.
- Reviewer output is advisory; final execution is still human-approved.
- Team members without admin permissions cannot merge or deploy.
- `/v2/gateway` and `/v2/retrieve/*` should use machine auth (`VTDD_GATEWAY_BEARER_TOKEN`) instead of browser login flow.
- Rotate machine auth secrets regularly and immediately on suspected exposure.
- Never paste bearer/service token values into chat, setup wizard answers, or Issue/PR text.
