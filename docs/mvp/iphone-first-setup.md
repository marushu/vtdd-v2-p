# iPhone-first Setup (MVP)

This runbook is for starting VTDD V2 from iPhone without local Mac setup.

## Principle

- Keep shared spec and workflow in GitHub.
- Keep user-specific memory in DB.
- Never paste cloud credentials into chats or setup answers.
- GitHub App bootstrap is one-time manual work. After that, VTDD mints short-lived installation tokens automatically.

## What You Prepare vs What VTDD Does

### You prepare once

- create the GitHub App
- install it to the target repository or organization
- download the App private key
- set Worker secrets:
  - `GITHUB_APP_ID`
  - `GITHUB_APP_INSTALLATION_ID`
  - `GITHUB_APP_PRIVATE_KEY`

### VTDD does automatically after setup

- create a short-lived GitHub App JWT from the private key
- mint a GitHub installation token
- fetch the live repository index from GitHub
- merge live repositories with alias/context resolution
- use the live repository list for natural conversation such as repo listing or repo switching

## GitHub App Bootstrap (One-time)

These steps are for first-time setup. They are manual because GitHub App creation, installation, and private key download require GitHub-side operator approval.

1. Open GitHub in Safari or on Mac and go to Developer Settings.
2. Create a new GitHub App.
3. Set a simple name such as `vtdd-butler`.
4. Set Homepage URL to your project or repository URL.
5. Disable features you do not need yet. Start from least privilege.
6. Grant only the minimum repository permissions VTDD needs for live repo index and PR-oriented work.
   - At minimum, repository metadata read access should be enabled.
   - If you later need PR or issue write paths, expand permissions deliberately.
7. Create the App.
8. Generate a private key and download the `.pem` file.
   - Keep this file private.
   - Do not paste it into chat, Issue, PR, or setup wizard answers.
9. Install the App to the target account or repository.
10. Copy these values from the GitHub App screens:
    - App ID -> `GITHUB_APP_ID`
    - Installation ID -> `GITHUB_APP_INSTALLATION_ID`
11. Open your Cloudflare Worker secret management and set:
    - `GITHUB_APP_ID`
    - `GITHUB_APP_INSTALLATION_ID`
    - `GITHUB_APP_PRIVATE_KEY`
12. Redeploy or restart the Worker so the new secrets are available.

## GitHub App Bootstrap Checklist

- App exists
- App is installed to the correct repo or org
- Private key file was downloaded once and stored safely
- `GITHUB_APP_ID` is set on Worker
- `GITHUB_APP_INSTALLATION_ID` is set on Worker
- `GITHUB_APP_PRIVATE_KEY` is set on Worker
- Worker has been redeployed after secret update

## Steps

1. Open Safari on iPhone and access setup URL:
   - `https://<your-worker-domain>/setup/wizard?repo=sample-org/vtdd-v2`
   - JSON mode (optional): `https://<your-worker-domain>/setup/wizard?format=json&repo=sample-org/vtdd-v2`
   - OpenAPI import URL (optional): `https://<your-worker-domain>/setup/wizard?format=openapi&repo=sample-org/vtdd-v2`
   - GitHub App diagnostics (optional): `https://<your-worker-domain>/setup/wizard?format=json&repo=sample-org/vtdd-v2&githubAppCheck=on`
   - Cloudflare setup diagnostics are opt-in and disabled by default.
2. Open ChatGPT on iPhone and edit the Butler Custom GPT.
3. Copy `Custom GPT Construction` from setup page.
4. For `Custom GPT Action Schema`, prefer `Schema Import URL` on iPhone. If import from URL is unavailable, fall back to copying full schema JSON.
5. Ensure GitHub `production` environment has required reviewers enabled.
6. Ensure GitHub has environment secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
7. Configure Worker runtime secret for machine auth (recommended):
   - `VTDD_GATEWAY_BEARER_TOKEN` (Cloudflare Worker secret)
   - set the same token in Custom GPT Action auth (Bearer)
   - fallback mode (if bearer cannot be used): `CF_ACCESS_CLIENT_ID` + `CF_ACCESS_CLIENT_SECRET`
   - setup output shows these setting names, but never the secret values themselves
8. Run `deploy-production` workflow with:
   - `approval_phrase=GO`
   - `passkey_verified=true`
9. Approve the production environment gate.
10. If operator will be away, set Worker runtime env:
   - `VTDD_AUTONOMY_MODE=guarded_absence`
   - return to normal by setting `VTDD_AUTONOMY_MODE=normal` (or unsetting it)

## If GitHub App Is Not Working

- If repo list stays limited to provided aliases only, check whether all three Worker secrets are set:
  - `GITHUB_APP_ID`
  - `GITHUB_APP_INSTALLATION_ID`
  - `GITHUB_APP_PRIVATE_KEY`
- If the App exists but still cannot see repos, confirm the App is installed to the correct repo or organization.
- If token mint fails, regenerate the private key and update `GITHUB_APP_PRIVATE_KEY`.
- If repo visibility looks wrong, re-check the installation target and repository permissions.
- If setup is unclear, verify the Worker can still operate safely with provided aliases, then return to GitHub App bootstrap before relying on live repo discovery.

## Optional Query Parameters

- `repo=owner/name` (repeatable): required repository list input
- `surface=custom_gpt` (repeatable): override initial surfaces
- `actionEndpointBaseUrl=https://...`: force action schema server URL
- `format=json`: return machine-readable wizard output
- `format=openapi`: return raw OpenAPI JSON for Custom GPT schema import
- `githubAppCheck=on`: run GitHub App bootstrap/token-mint/live-index diagnostics
- `cloudflareCheck=on`: run Cloudflare setup diagnostics (requires env opt-in below)
- `policyInput.autonomyMode=guarded_absence`: optional request-level mode flag (runtime env takes precedence)
- `repositoryVisibility=private|public`: optional deploy authority hint for setup output
- `branchProtectionApiStatus=available|unavailable|forbidden|unknown`: optional GitHub protection hint for setup output
- `rulesetsApiStatus=available|unavailable|forbidden|unknown`: optional GitHub rulesets hint for setup output
- `deployAuthorityPreference=auto|github_assisted|vtdd_managed`: optional deploy authority preference hint

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
