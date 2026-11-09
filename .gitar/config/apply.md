Apply fixes on your own when the finding is one of these and the change stays inside the files the pull request already touches:

- a failing test, type error, or build error caused by this pull request;
- an N+1 or sequential Elasticsearch call that should be one batched or parallel request;
- missing input validation or a response that does not use the `{ "error": { "code", "message" } }` shape;
- an accessibility defect with an unambiguous fix: a missing label, a non-button click target, a missing reduced-motion path.

Do not apply on your own, comment instead:

- anything that changes `docs/api.md` or the shape of an API response;
- changes under `deploy/`, `argocd/`, `.github/workflows/` or to the `Dockerfile`, because merging them changes the running cluster;
- changes to `app/data/`;
- visual design choices in `web/` (colour, type, spacing, motion).
