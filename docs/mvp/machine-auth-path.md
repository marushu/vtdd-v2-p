# Machine Auth Path for `/v2/gateway` and `/v2/retrieve/*`

## Purpose

Keep `/setup/*` human-login oriented while allowing GPT Actions to call protected API routes with machine auth.

## Contract

- If `VTDD_GATEWAY_BEARER_TOKEN` is set on Worker env, protected routes require:
  - `Authorization: Bearer <token>`
- If bearer token is not configured and Cloudflare Access service token env is set:
  - `CF_ACCESS_CLIENT_ID`
  - `CF_ACCESS_CLIENT_SECRET`
  - request must include matching `cf-access-client-id` and `cf-access-client-secret` headers
- Protected routes:
  - `/v2/gateway`
  - `/v2/retrieve/constitution`
  - `/v2/retrieve/decisions`
  - `/v2/retrieve/proposals`
  - `/v2/retrieve/cross`
- If neither is configured, these routes remain open for backward compatibility.

## Error Behavior

- Missing/invalid machine auth -> `401` with JSON body:
  - `{"ok":false,"error":"unauthorized","reason":"..."}`
- Policy-denied but authenticated request -> `422`

## MVP Recommendation

Use bearer token mode for Custom GPT Actions:

1. Set Worker secret `VTDD_GATEWAY_BEARER_TOKEN`
2. Configure Custom GPT Action auth as Bearer using the same secret
3. Keep `/setup/*` protected via browser login path
