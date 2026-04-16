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
2. Open ChatGPT on iPhone and edit the Butler Custom GPT.
3. Copy `Custom GPT Construction` and `Custom GPT Action Schema` from setup page.
4. Ensure GitHub `production` environment has required reviewers enabled.
5. Ensure GitHub has environment secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
6. Configure Worker runtime secret for machine auth:
   - `VTDD_GATEWAY_BEARER_TOKEN` (Cloudflare Worker secret)
   - set the same token in Custom GPT Action auth (Bearer)
7. Run `deploy-production` workflow with:
   - `approval_phrase=GO`
   - `passkey_verified=true`
8. Approve the production environment gate.

## Optional Query Parameters

- `repo=owner/name` (repeatable): override repository list
- `surface=custom_gpt` (repeatable): override initial surfaces
- `actionEndpointBaseUrl=https://...`: force action schema server URL
- `format=json`: return machine-readable wizard output

## Security Boundary

- High-risk actions remain `GO + passkey`.
- Reviewer output is advisory; final execution is still human-approved.
- Team members without admin permissions cannot merge or deploy.
- `/v2/gateway` should use machine auth (`VTDD_GATEWAY_BEARER_TOKEN`) instead of browser login flow.
