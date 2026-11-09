#!/usr/bin/env python3
"""Create or update the Dash0 dashboards kept in observability/.

    ./scripts/dash0-apply-dashboards.py

Reads DASH0_OTLP_ENDPOINT and DASH0_AUTH_TOKEN from .env (the API host is
derived from the ingress host) and PUTs every observability/*.dashboard.yaml
to Dash0, using the dashboard's metadata.name as its stable id. Running it
twice is safe. Needs PyYAML. The token is never printed.
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

    files = sorted(glob.glob(os.path.join(ROOT, "observability", "*.dashboard.yaml")))
    if not files:
        sys.exit("No observability/*.dashboard.yaml files found.")

    failed = False
    for path in files:
        with open(path, encoding="utf-8") as handle:
            dashboard = yaml.safe_load(handle)
        name = dashboard["metadata"]["name"]
        request = urllib.request.Request(
            f"https://api.{host}/api/dashboards/{name}?dataset={dataset}",
            method="PUT",
            data=json.dumps(dashboard).encode(),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                version = json.load(response).get("metadata", {}).get("version")
                print(f"applied {os.path.basename(path)} as {name} (version {version})")
        except urllib.error.HTTPError as error:
            failed = True
            print(f"FAILED {os.path.basename(path)}: HTTP {error.code} {error.read().decode()[:300]}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
