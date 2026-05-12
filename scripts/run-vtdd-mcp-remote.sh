#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: scripts/run-vtdd-mcp-remote.sh <mcp-url>" >&2
  exit 1
fi

MCP_URL="$1"
shift

TRANSPORT="${VTDD_MCP_TRANSPORT:-http-only}"
HEADER_ARGS=()

if [[ -n "${VTDD_MCP_TOKEN:-}" ]]; then
  HEADER_ARGS+=(--header "Authorization: Bearer ${VTDD_MCP_TOKEN}")
fi

ALLOW_HTTP_ARGS=()
if [[ "$MCP_URL" == http://* ]]; then
  ALLOW_HTTP_ARGS+=(--allow-http)
fi

exec npx -y mcp-remote "$MCP_URL" \
  "${ALLOW_HTTP_ARGS[@]}" \
  --transport "$TRANSPORT" \
  --silent \
  "${HEADER_ARGS[@]}" \
  "$@"
