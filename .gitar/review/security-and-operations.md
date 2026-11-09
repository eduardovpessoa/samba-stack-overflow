# Security and operations

This repository and its container image are public, and the app runs on a
shared hackathon cluster with a public URL.

## Secrets

- No key, token or endpoint with credentials in code, tests, the Dockerfile,
  build arguments, manifests, or logs. Credentials come from the Kubernetes
  Secret `app-credentials` through `secretKeyRef`.
- Treat any string that looks like an API key in a diff as a blocker, even in
  a comment or a test fixture.
- The only token the browser may receive is `DASH0_RUM_TOKEN`, an ingest-only
  token. Flag any other secret reaching `/api/meta` or the frontend bundle.

## Telemetry

- Every new route or Elasticsearch operation that can be slow gets a span via
  `withSpan` and useful attributes. Custom attributes use the `samba.` prefix.
- Log with `log()` from `app/src/telemetry.js`, never `console.log`, so logs
  carry the trace id and reach Dash0.
- Never put the user's query text, question text, or any credential in a span
  attribute, metric attribute, or log. Lengths and counts are fine.
- Metric attributes must be low cardinality: modes and outcomes, never ids or
  free text.

## Kubernetes

- `/healthz` must not call Elasticsearch or any other dependency: a
  dependency outage must not restart healthy pods. `/readyz` is where
  dependency state belongs.
- Containers keep `runAsNonRoot`, `allowPrivilegeEscalation: false`,
  `readOnlyRootFilesystem`, dropped capabilities, and both requests and limits.
- `deploy/kustomization.yaml` `newName` and `newTag` are written by the
  `build-and-deploy` workflow. Flag manual edits to them.
- Cluster changes go through git and Argo CD. Flag instructions or scripts
  that `kubectl apply` app manifests by hand.

## Dependencies

- A new dependency needs a reason in the pull request description. Prefer the
  Node standard library (`node:test`, `fetch`, `node:crypto`).
