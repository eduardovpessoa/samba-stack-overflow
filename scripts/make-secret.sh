#!/usr/bin/env bash
# Turn the local .env into a Kubernetes Secret manifest for the cluster.
#
#   ./scripts/make-secret.sh
#
# Writes app-credentials.secret.yaml (git-ignored) and prints nothing secret.
# Paste that file into Radar Cloud (Resources > Secrets > +), or apply it with
# kubectl. Never commit it: this repository is public.
set -euo pipefail

cd "$(dirname "$0")/.."
env_file=".env"
out="app-credentials.secret.yaml"

if [[ ! -f "$env_file" ]]; then
  echo "No .env found. Run: cp .env.example .env  and fill it in." >&2
  exit 1
fi

# Read KEY=value lines without executing the file.
value_of() {
  local line
  line="$(grep -E "^$1=" "$env_file" | tail -n 1 || true)"
  printf '%s' "${line#*=}"
}

team="$(value_of TEAM_NAME)"
: "${team:=samba-stack-overflow}"

required=(ELASTICSEARCH_URL ELASTICSEARCH_API_KEY DASH0_OTLP_ENDPOINT DASH0_AUTH_TOKEN)
for key in "${required[@]}"; do
  if [[ -z "$(value_of "$key")" ]]; then
    echo "$key is empty in .env. Fill it in first." >&2
    exit 1
  fi
done

# JSON string quoting is valid YAML and survives any character in a token.
quote() {
  node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"
}

umask 077
{
  echo "apiVersion: v1"
  echo "kind: Secret"
  echo "metadata:"
  echo "  name: app-credentials"
  echo "  namespace: team-${team}"
  echo "type: Opaque"
  echo "stringData:"
  echo "  elasticsearch-url: $(quote "$(value_of ELASTICSEARCH_URL)")"
  echo "  elasticsearch-api-key: $(quote "$(value_of ELASTICSEARCH_API_KEY)")"
  echo "  dash0-otlp-endpoint: $(quote "$(value_of DASH0_OTLP_ENDPOINT)")"
  echo "  dash0-auth-token: $(quote "$(value_of DASH0_AUTH_TOKEN)")"
  for pair in "DASH0_RUM_TOKEN:dash0-rum-token" "OPENAI_API_KEY:openai-api-key"; do
    key="${pair%%:*}"
    name="${pair##*:}"
    if [[ -n "$(value_of "$key")" ]]; then
      echo "  ${name}: $(quote "$(value_of "$key")")"
    fi
  done
} > "$out"

echo "Wrote $out for namespace team-${team} (git-ignored)."
echo "It holds $(sed -n '/^stringData:/,$p' "$out" | grep -cE '^  [a-z0-9-]+: ') keys. Paste the file into Radar Cloud > Resources > Secrets > +, then Apply."
