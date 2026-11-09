# Samba Stack Overflow 🇧🇷

**Find your talk. Find your people.**

A conference companion with a little Brazilian rhythm. Describe what you care
about in your own words, get the talks that fit and the reason each one fits,
build a personal agenda (your *setlist*) that warns you about clashes, and
find people building similar things (your *roda*, the circle where samba
happens).

Built solo in one afternoon at the Cloud Native Hackathon (Salt Lake City,
November 9, 2026).

- **Live:** https://samba-stack-overflow.cnh.radarhq.io
- **Demo script:** [docs/demo.md](docs/demo.md)

*An independent hackathon project. It is not affiliated with or endorsed by
Stack Overflow or Stack Exchange Inc.*

## What it does

- **Ask in plain language.** "I'm a backend developer new to eBPF, what
  should I attend?" works as well as `ebpf`.
- **See why it matched.** Every result shows its rank in the keyword search
  and in the meaning search, the passage that matched, and plain reasons.
- **Setlist.** Pick talks, see time clashes, export to your calendar, and
  share it: a shared setlist is saved in Elasticsearch and opens from a link.
- **Fill my free time.** One Elasticsearch query ranks talks by how close
  they are to what you picked and filters out everything that would clash.
- **Accessibility first.** Filter by captions, step-free access, sign
  language and low-sensory rooms. Anything the organisers have not published
  is shown as "Not published", never guessed.
- **Roda.** Say what you are building and meet similar profiles.
- **Search you can see into.** Every search shows how many Elasticsearch
  round trips it took and which pod answered.
- **Installs like an app.** Add it to your phone's home screen. It can remind
  you ten minutes before a talk while it is open or recently in the
  background (local reminders, not push).

The schedule and the people are an openly labelled **demo dataset** written
for this project: 42 fictional talks and 18 fictional profiles.

## How it is built

```
 browser ──▶ Node.js backend ──▶ Elasticsearch Serverless
 (React)     (one container)      semantic_text + Jina embeddings
                  │                hybrid search with RRF
                  └─ OpenTelemetry ──▶ Dash0 (traces, metrics, logs)

 git push ──▶ GitHub Actions ──▶ GHCR ──▶ Argo CD ──▶ Kubernetes
     │                                                    ▲
     └─ pull request ──▶ Gitar review                     └─ Radar
```

| | What it does here |
|---|---|
| **Elasticsearch** | The only data store. Sessions and profiles are indexed with a `semantic_text` field (Jina embeddings, sentence-sized chunks). Each search fuses a keyword query and a semantic query with reciprocal rank fusion, and the semantic highlighter returns the passage that matched. Facets, agenda lookups, free-time suggestions, shared setlists and people matching are Elasticsearch too. |
| **Dash0** | OpenTelemetry auto-instrumentation plus custom spans, metrics and logs, browser monitoring, and a dashboard and an alert rule kept in `observability/`. `samba.search.es_round_trips` records how many Elasticsearch calls one search needed, which is how the N+1 regression shows up. |
| **Radar** | The app runs in the team's cluster, deployed by Argo CD on every push to `main`. Radar shows the rollout, the topology and the timeline, and runs the AI investigation when something breaks. |
| **Gitar** | Every change lands through a pull request that Gitar reviews against this project's own rules in `.gitar/review/` and `.gitar/rules/`. |

### Decisions worth knowing

- **One backend, one container.** The Node.js server serves both the API and
  the built React app. Nothing else to deploy.
- **No second database.** Talks, profiles, shared setlists and the incident
  switch all live in Elasticsearch.
- **A contract between the two halves.** `docs/api.md` is the only agreement
  between `app/` and `web/`, and the contract tests in `app/test/` hold the
  backend to it.
- **Fixed number of round trips.** A search makes four Elasticsearch
  requests whatever the page size. A request per result is the bug the
  practice incident reproduces.
- **Never invent data.** Accessibility values are yes, no or unknown, and
  unknown is shown as "Not published".
- **Ready is not the same as alive.** `/healthz` never touches a dependency;
  `/readyz` waits for the search index. An Elasticsearch outage must not
  restart healthy pods.

## Built with

| Area | Technology |
|---|---|
| Search and data | Elasticsearch Serverless: `semantic_text`, Jina embeddings v3 through the Elastic Inference Service, reciprocal rank fusion, the semantic highlighter, aggregations |
| Backend | Node.js 22, Express 5, the official Elasticsearch JavaScript client, `node:test` |
| Frontend | React 19, TypeScript, Vite, Motion, plain CSS with design tokens, a web app manifest and a service worker |
| Observability | OpenTelemetry (Node.js auto-instrumentation and API), Dash0 (traces, metrics, logs, browser monitoring with the Dash0 web SDK, dashboards, alert rules, Agent0, MCP server) |
| Platform | Docker, Kubernetes (the hackathon's virtual cluster), kustomize, Argo CD, GitHub Actions, GitHub Container Registry |
| Operations | Radar Cloud: timeline, Checks, MCP server, hosted AI investigations |
| Code review | Gitar, with project review instructions, repository rules and auto-apply criteria |
| AI assistance | Claude Code (see the next section) |

## How it was made, and the AI disclosure

The hackathon rules ask that AI assistance be disclosed. Plainly:

- **Claude Code** (Anthropic's coding agent, model Claude Fable 5.2) wrote
  most of the code, tests, manifests and documents in this repository, in one
  working session, directed by the author. Commits it prepared carry a
  `Co-Authored-By: Claude` line. It also used the Dash0 and Radar MCP servers
  to read live telemetry and cluster state.
- **The author, Eduardo Viana Pessoa,** wrote the product brief the work
  started from, chose to build on all four sponsor tools, created and
  configured the Elastic, Dash0, Radar and Gitar accounts, supplied the
  credentials, applied the cluster Secret and the Argo CD Application in
  Radar Cloud, asked for features and changes along the way, and decided on
  every merge to `main`.
- **Other AI tools did what they are for:** Gitar reviewed every pull request
  and pushed one fix commit itself; Dash0's Agent0 investigated the slow
  searches and drafted the dashboard and the alert rule; Radar's AI
  investigator checked the first release. Their findings and what was done
  about each are in `docs/investigations/` and in the pull requests.
- The demo dataset (talks and profiles) was also written with Claude and is
  fictional.

Everything was built on November 9, 2026, after the hackathon started. The
git history shows the whole day.

## Run it locally

You need Node.js 22 or newer and npm. An Elasticsearch Serverless project is
needed for real search; without one the backend starts a crude offline
fallback and says so in the UI.

1. Get the code and install both halves.

   ```bash
   git clone https://github.com/eduardovpessoa/samba-stack-overflow.git
   cd samba-stack-overflow
   npm install --prefix app
   npm install --prefix web
   ```

2. Add your credentials. `.env` is git-ignored.

   ```bash
   cp .env.example .env
   ```

   Fill in `ELASTICSEARCH_URL` and `ELASTICSEARCH_API_KEY` (an API key
   created inside the Elasticsearch project). `DASH0_OTLP_ENDPOINT` and
   `DASH0_AUTH_TOKEN` are optional: without them telemetry is switched off.

3. Start the backend (port 8080). On first start it creates the indices and
   loads the demo dataset.

   ```bash
   npm run dev --prefix app
   ```

4. In a second terminal, start the frontend (port 5173).

   ```bash
   npm run dev --prefix web
   ```

5. Open http://localhost:5173.

## Test it

```bash
npm test --prefix app
```

40 unit and contract tests on `node:test`. They run against the offline
store, so they need no credentials and no network.

```bash
npm run build --prefix web
```

Type-checks the frontend and makes the production build. Both commands run
on every pull request (`.github/workflows/ci.yaml`), along with a render of
the Kubernetes manifests and a build of the container image.

## Validate it

With the backend running, these should all work. Replace the address with
the live URL to check the deployed app instead.

```bash
curl -s localhost:8080/readyz
```

Expect `{"ready":true}`.

```bash
curl -s localhost:8080/api/meta | jq '.search'
```

Expect `"engine": "elasticsearch"` and `"semantic": true`. If it says
`offline-fallback`, the Elasticsearch credentials were not picked up.

```bash
curl -s --get localhost:8080/api/search --data-urlencode 'q=People who cannot hear should still be able to follow my presentation' | jq '{top: .results[0].title, ranks: .results[0].ranks, diagnostics}'
```

Expect "Sign Language Interpreters and You" first, ranked higher by meaning
than by keywords, and `roundTrips: 4`.

Then, in the browser:

1. Search for something in your own words and read "Why it matched".
2. Add two talks that overlap: the setlist flags the clash.
3. Press **Fill my free time**: none of the suggestions clash with your picks.
4. Press **Share setlist**, open the link in a private window, and add the
   shared talks.
5. Use the whole page with the keyboard only (`/` focuses search, `Esc`
   closes the detail sheet).

If Dash0 is configured, the service `samba-stack-overflow` appears there
within a minute of the first search.

## Deploy

Pushing to `main` builds the image and Argo CD rolls it out. Credentials are
never in git: they live in a Kubernetes Secret named `app-credentials` in
namespace `team-samba-stack-overflow`, with these keys:

`elasticsearch-url`, `elasticsearch-api-key`, `dash0-otlp-endpoint`,
`dash0-auth-token`, and optionally `dash0-rum-token`, `openai-api-key` and
`ops-token`.

`scripts/make-secret.sh` writes that Secret from your `.env` into a
git-ignored file, without printing any value.

## Practice incident

The Ops drawer in the footer has a switch that makes search enrich each
result with its own Elasticsearch query instead of one batched query. It is a
real N+1 regression, not a sleep, and it switches itself off after ten
minutes. On the cluster it asks for the ops token (`OPS_TOKEN` in
`.env.local`, generated by `scripts/make-secret.sh`): Gitar's review of the
first pull request pointed out that an open switch on a public URL would let
anyone slow the site down. Turn it on, watch the round trips go from 4 to 15
on the page and in Dash0, and ask Agent0 what changed.

## Repository map

| Path | What is there |
|---|---|
| `app/` | Backend: API, Elasticsearch store, telemetry, tests |
| `web/` | Frontend: React, TypeScript, Vite |
| `docs/api.md` | The API contract both sides follow |
| `docs/demo.md` | The demo, as a script to read out loud |
| `docs/investigations/` | What Dash0's Agent0 and Radar's AI found, and what was done |
| `deploy/`, `argocd/` | Kubernetes manifests and the Argo CD Application |
| `observability/` | The Dash0 dashboard and alert rule, as code |
| `.gitar/` | Gitar review instructions, repository rules, auto-apply criteria |
| `AGENTS.md` | Conventions for coding and review agents |

## Credits

- The deploy workflow, the Argo CD Application, `deploy/service.yaml`,
  `deploy/httproute.yaml`, `docs/radar-operations.md`, `.agents/skills/` and
  `examples/agent-workflows/` come from the hackathon's official starter,
  [skyhook-io/cnh-starter](https://github.com/skyhook-io/cnh-starter),
  adapted to this project. Everything else was written for this project
  during the hackathon.
- Fonts: Bricolage Grotesque, Instrument Sans and JetBrains Mono, bundled
  through Fontsource under the SIL Open Font License.
- Open-source libraries are listed in `app/package.json` and
  `web/package.json`.
