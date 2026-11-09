---
title: "Label pull requests by area"
description: "Label each pull request with the parts of the system it touches, so a solo developer can scan what shipped."
type: automation
when: "A pull request is opened or new commits are pushed"
actions: "Add area labels based on the changed paths"
---

# Label pull requests by area

Add every label that applies, and remove ones that no longer apply:

- `area:search` for changes under `app/src/store/` or to search logic in
  `app/src/logic.js`
- `area:api` for changes to `app/src/app.js` or `docs/api.md`
- `area:web` for changes under `web/`
- `area:observability` for changes to `app/src/otel.js` or
  `app/src/telemetry.js`
- `area:deploy` for changes under `deploy/`, `argocd/`, `.github/workflows/`
  or to the `Dockerfile`
- `area:data` for changes under `app/data/`

When a pull request carries `area:deploy`, add one short comment reminding
the author that merging to `main` deploys to the cluster through Argo CD, and
that the rollout should be checked in Radar afterwards. Post it once per pull
request.
