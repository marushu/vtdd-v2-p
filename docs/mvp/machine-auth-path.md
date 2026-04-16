# Machine Auth Path for `/v2/gateway` and `/v2/retrieve/*`

## Purpose

Keep `/setup/*` human-login oriented while allowing GPT Actions to call protected API routes with machine auth.

## Contract

- Protected routes:
  - `/v2/gateway` (legacy `/mvp/gateway` also accepted)
  - `/v2/retrieve/constitution` (legacy `/mvp/retrieve/constitution` also accepted)
  - `/v2/retrieve/decisions` (legacy `/mvp/retrieve/decisions` also accepted)
  - `/v2/retrieve/proposals` (legacy `/mvp/retrieve/proposals` also accepted)
  - `/v2/retrieve/cross` (legacy `/mvp/retrieve/cross` also accepted)
- Auth mode priority:
  1. Worker bearer mode (`VTDD_GATEWAY_BEARER_TOKEN` or legacy `MVP_GATEWAY_BEARER_TOKEN`)
  2. Cloudflare Access service token mode (`CF_ACCESS_CLIENT_ID` + `CF_ACCESS_CLIENT_SECRET`)
  3. Open mode (backward compatibility only, not recommended)
- Bearer mode requires:
  - `Authorization: Bearer <token>`
- Cloudflare Access service token mode requires:
  - `cf-access-client-id: <CF_ACCESS_CLIENT_ID>`
  - `cf-access-client-secret: <CF_ACCESS_CLIENT_SECRET>`
- If neither mode is configured, these routes remain open for backward compatibility (temporary migration mode).

## Error Behavior

- `401 Unauthorized`
  - machine auth credential is missing
- `403 Forbidden`
  - machine auth credential was provided but invalid/mismatched
  - unsupported or malformed auth header
- `422 Unprocessable Entity`
  - request is authenticated but blocked by policy gate (GO/passkey/traceability/etc.)
- Error body format:
  - `{"ok":false,"error":"unauthorized","reason":"..."}`

## MVP Recommendation

Use bearer token mode for Custom GPT Actions:

1. Set Worker secret `VTDD_GATEWAY_BEARER_TOKEN`
2. Configure Custom GPT Action auth as Bearer using the same secret
3. Keep `/setup/*` protected via browser login path

Cloudflare Access service token mode is a valid fallback when bearer auth cannot be used by the caller.

## Rotation / Revocation / Least Privilege

- Rotation
  - rotate `VTDD_GATEWAY_BEARER_TOKEN` regularly and immediately after suspected leakage
  - for Access mode, rotate both `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` as one set
- Revocation
  - remove compromised secret from Worker runtime immediately
  - update Custom GPT Action auth secret or Access service token headers before restoring traffic
- Least privilege
  - only grant scopes required for API invocation path
  - keep `/setup/*` and browser-auth path separate from machine-auth API path
  - keep high-risk execution controls (`GO + passkey`) unchanged
