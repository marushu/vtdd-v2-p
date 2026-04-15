# iPhone-first Setup (MVP)

This runbook is for starting VTDD V2 from iPhone without local Mac setup.

## Principle

- Keep shared spec and workflow in GitHub.
- Keep user-specific memory in DB.
- Never paste cloud credentials into chats or setup answers.

## Steps

1. Open ChatGPT on iPhone and edit the Butler Custom GPT.
2. Copy `constructionText` and `actionSchemaJson` from `runInitialSetupWizard(...).onboarding.customGpt`.
3. Ensure GitHub `production` environment has required reviewers enabled.
4. Ensure GitHub has environment secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
5. Run `deploy-production` workflow with:
   - `approval_phrase=GO`
   - `passkey_verified=true`
6. Approve the production environment gate.

## Security Boundary

- High-risk actions remain `GO + passkey`.
- Reviewer output is advisory; final execution is still human-approved.
- Team members without admin permissions cannot merge or deploy.
