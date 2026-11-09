# Samba Stack Overflow: notes for coding and review agents

A conference companion: find the right talk, build a personal agenda (the
"setlist"), and find people building similar things (the "roda"). Built solo
at the Cloud Native Hackathon, so the code is small on purpose.

## How it fits together

- `app/` is one Node.js (CommonJS, Node 22) backend. It serves the JSON API
  and the built frontend. Entry point: `app/server.js`.
- `web/` is a React + TypeScript + Vite frontend. Its build output is copied
  into the backend image and served as static files.
- **Elasticsearch is the data layer.** Sessions and demo profiles are indexed
  with a `semantic_text` field. Search is hybrid: a keyword query and a
  semantic query fused with reciprocal rank fusion. All Elasticsearch access
  lives in `app/src/store/elastic.js`.
- `app/src/store/offline.js` is a crude local fallback for development without
  credentials. It must always identify itself as `offline-fallback`.
- `app/src/logic.js` holds pure functions (validation, highlights, conflict
  detection, calendar export). They are unit tested and do no I/O.
- OpenTelemetry is preloaded by `app/src/otel.js` and sends traces, metrics
  and logs to Dash0. `app/src/telemetry.js` has the helpers to use.
- `deploy/` is a kustomize folder that Argo CD syncs to the cluster.
  `.github/workflows/deploy.yaml` builds the image on every push to `main`.

## Conventions

- `docs/api.md` is the contract between `app/` and `web/`. Change it first,
  then both sides and `app/test/api.test.js`, in the same pull request.
- Every feature lands through a pull request that Gitar reviews. Review rules
  are in `.gitar/review/`, repository rules in `.gitar/rules/`.
- Validate input at the edge and throw `HttpError`. Every error response is
  `{ "error": { "code", "message" } }`.
- One search request makes a fixed number of Elasticsearch round trips. Never
  await an Elasticsearch call inside a loop over results.
- Never invent data. Accessibility values are `yes`, `no` or `unknown`, and
  `unknown` is shown as "Not published". Demo data is always labelled as demo.
- Times are ISO 8601 with an offset and are compared as instants.
- No secrets in the repo, the image, logs or telemetry. The repo is public.
- Log with `log()` from `app/src/telemetry.js`, never `console.log`. Do not
  log or trace the text of a user's query.
- Tests use `node:test`. Run `npm test` in `app/` and `npm run build` in
  `web/` before pushing.
- Keep dependencies few. Prefer the Node standard library.

## Commands

```bash
cd app && npm install && npm run dev     # API on :8080, reads ../.env
cd web && npm install && npm run dev     # UI on :5173, proxies /api to :8080
cd app && npm test                       # unit and contract tests
cd web && npm run build                  # typecheck and production build
```

---

@docs/radar-operations.md
