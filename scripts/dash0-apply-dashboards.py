#!/usr/bin/env python3
"""Create or update the Dash0 dashboards and alert rules kept in observability/.

    ./scripts/dash0-apply-dashboards.py

Reads DASH0_OTLP_ENDPOINT and DASH0_AUTH_TOKEN from .env (the API host is
derived from the ingress host) and PUTs to Dash0:

- every observability/*.dashboard.yaml, with the dashboard's metadata.name
  as its stable id;
- every observability/*.check-rule.yaml, with "samba-" plus the file name
  as its stable id (search-round-trips.check-rule.yaml becomes
  samba-search-round-trips).

Running it twice is safe. Needs PyYAML. The token is never printed.
"""
import glob
import json
import os
import re
import sys
import urllib.error
import urllib.request

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read_env(path):
    values = {}
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            match = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
            if match:
                values[match.group(1)] = match.group(2)
    return values


def main():
    env = read_env(os.path.join(ROOT, ".env"))
    endpoint, token = env.get("DASH0_OTLP_ENDPOINT"), env.get("DASH0_AUTH_TOKEN")
    if not endpoint or not token:
        sys.exit("DASH0_OTLP_ENDPOINT and DASH0_AUTH_TOKEN must be set in .env.")
    host = re.sub(r"^https?://ingress\.", "", endpoint).split("/")[0].split(":")[0]
    dataset = env.get("DASH0_DATASET", "default")

    targets = []
    for path in sorted(glob.glob(os.path.join(ROOT, "observability", "*.dashboard.yaml"))):
        with open(path, encoding="utf-8") as handle:
            body = yaml.safe_load(handle)
        targets.append((path, f"/api/dashboards/{body['metadata']['name']}", body))
    for path in sorted(glob.glob(os.path.join(ROOT, "observability", "*.check-rule.yaml"))):
        with open(path, encoding="utf-8") as handle:
            body = yaml.safe_load(handle)
        rule_id = "samba-" + os.path.basename(path)[: -len(".check-rule.yaml")]
        targets.append((path, f"/api/alerting/check-rules/{rule_id}", body))
    if not targets:
        sys.exit("Nothing to apply in observability/.")

    failed = False
    for path, api_path, body in targets:
        request = urllib.request.Request(
            f"https://api.{host}{api_path}?dataset={dataset}",
            method="PUT",
            data=json.dumps(body).encode(),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=30):
                print(f"applied {os.path.basename(path)} to {api_path}")
        except urllib.error.HTTPError as error:
            failed = True
            print(f"FAILED {os.path.basename(path)}: HTTP {error.code} {error.read().decode()[:300]}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
