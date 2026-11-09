#!/usr/bin/env bash
# Call Dash0's hosted MCP server from the terminal, with the token in .env.
#
#   ./scripts/dash0-mcp.sh list                       # tool names and summaries
#   ./scripts/dash0-mcp.sh schema <tool>              # one tool's input schema
#   ./scripts/dash0-mcp.sh call <tool> '<json args>'  # run a tool
#
# The MCP URL is derived from DASH0_OTLP_ENDPOINT (ingress.<region> becomes
# api.<region>); set DASH0_MCP_URL to override. The token is never printed.
set -euo pipefail

cd "$(dirname "$0")/.."
value_of() {
  local line
  line="$(grep -E "^$1=" .env | tail -n 1 || true)"
  printf '%s' "${line#*=}"
}

token="$(value_of DASH0_AUTH_TOKEN)"
endpoint="$(value_of DASH0_OTLP_ENDPOINT)"
url="${DASH0_MCP_URL:-}"
if [[ -z "$url" ]]; then
  host="$(printf '%s' "$endpoint" | sed -E 's#https?://ingress\.##; s#[:/].*##')"
  url="https://api.${host}/mcp"
fi
if [[ -z "$token" || -z "$endpoint" ]]; then
  echo "DASH0_AUTH_TOKEN and DASH0_OTLP_ENDPOINT must be set in .env." >&2
  exit 1
fi

rpc() {
  curl -sS -m "${DASH0_MCP_TIMEOUT:-120}" -X POST "$url" \
    -H "Authorization: Bearer ${token}" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d "$1" | sed -E 's/^data: //; /^event:/d; /^$/d'
}

case "${1:-}" in
  list)
    rpc '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' |
      jq -r '.result.tools[] | "\(.name)\t\(.description | gsub("\\s+"; " ") | .[0:150])"'
    ;;
  schema)
    rpc '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' |
      jq --arg name "${2:?tool name}" '.result.tools[] | select(.name == $name) | {name, description, inputSchema}'
    ;;
  call)
    args="${3:-}"
    [[ -n "$args" ]] || args='{}'
    body="$(jq -cn --arg name "${2:?tool name}" --argjson args "$args" \
      '{jsonrpc: "2.0", id: 1, method: "tools/call", params: {name: $name, arguments: $args}}')"
    rpc "$body" | jq -r 'if .error then "ERROR: \(.error | tostring)" else (.result.content[]? | .text // (. | tostring)) end'
    ;;
  *)
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
