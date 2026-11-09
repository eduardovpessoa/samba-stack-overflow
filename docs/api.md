# API contract

The backend (`app/`) and the frontend (`web/`) only talk through this contract.
Change it here first, then change both sides in the same pull request.

All responses are JSON unless noted. Times are ISO 8601 strings **with a UTC
offset** (for example `2026-11-10T10:00:00-07:00`). The conference timezone is
sent in `/api/meta`; the frontend never guesses it.

## Errors

Every non-2xx JSON response has this shape:

```json
{ "error": { "code": "bad_request", "message": "Human readable sentence." } }
```

Codes: `bad_request` (400), `forbidden` (403), `not_found` (404),
`rate_limited` (429), `ask_unavailable` (503), `search_unavailable` (503),
`internal` (500).

Every 503 and 429 carries a `Retry-After` header in seconds. A 503 is short-lived
(the index is warming up after a restart, or a dependency hiccuped), so
clients should retry once after that delay before showing an error.

## Shared types

```ts
type Tri = "yes" | "no" | "unknown";   // never guess: unknown stays unknown

type Session = {
  id: string;
  title: string;
  description: string;
  speakers: { name: string; role: string; company: string }[];
  track: string;
  format: "Keynote" | "Talk" | "Workshop" | "Lightning" | "Panel";
  level: "Beginner" | "Intermediate" | "Advanced";
  room: string;
  start: string;                        // ISO 8601 with offset
  end: string;                          // ISO 8601 with offset
  day: string;                          // YYYY-MM-DD in the conference timezone
  tags: string[];
  accessibility: { captions: Tri; stepFree: Tri; signLanguage: Tri; lowSensory: Tri };
};

// Highlighted text, safe to render: no HTML ever crosses the API.
type Segment = { text: string; hit: boolean };

type SessionHit = Session & {
  score: number;
  ranks: { keyword: number | null; semantic: number | null }; // 1-based rank in each retriever
  highlights: { title: Segment[] | null; description: Segment[] | null; semantic: Segment[] | null };
  why: string[];                        // short, deterministic reasons this matched
  speakerOtherTalks: number;            // other sessions by the same speakers
};

type Person = {
  id: string;
  name: string;
  role: string;
  company: string;
  building: string;
  interests: string[];
  lookingFor: string;
};
```

## Endpoints

### `GET /healthz`
`200 ok` (text). Liveness only: never touches Elasticsearch.

### `GET /readyz`
`200 {"ready":true}` when the search index is reachable and seeded, else
`503 {"ready":false,"reason":"..."}`.

### `GET /api/meta`

```ts
{
  app: { name: string; version: string; team: string };
  conference: { name: string; timezone: string; dataset: "demo"; notice: string };
  search: {
    engine: "elasticsearch" | "offline-fallback";
    semantic: boolean;                  // false => only "keyword" mode is honest
    modes: ("hybrid" | "keyword" | "semantic")[];
  };
  facets: {
    days: { key: string; count: number }[];     // key = YYYY-MM-DD
    tracks: { key: string; count: number }[];
    levels: { key: string; count: number }[];
    formats: { key: string; count: number }[];
  };
  features: { ask: boolean };
  rum: { endpoint: string; token: string; serviceName: string } | null;
  chaos: { mode: "off" | "n-plus-one"; protected: boolean };  // protected => POST needs X-Ops-Token
}
```

### `GET /api/search`

Query string: `q` (required, 1 to 300 chars), `mode` (`hybrid` default,
`keyword`, `semantic`), `day` (`YYYY-MM-DD`), `track`, `level`,
`a11y` (comma list of `captions,stepFree,signLanguage,lowSensory`; only
sessions where each one is `yes`), `size` (1 to 30, default 12).

```ts
{
  query: string;
  mode: "hybrid" | "keyword" | "semantic";   // the mode actually used
  engine: "elasticsearch" | "offline-fallback";
  tookMs: number;                            // whole request, server side
  total: number;
  results: SessionHit[];
  // How this answer was produced. Shown to people on purpose: a search should
  // take the same few round trips whatever the page size.
  diagnostics: {
    roundTrips: number;                      // Elasticsearch requests for this search
    strategy: "batched" | "sequential";      // sequential = the practice incident
    traceId: string | null;                  // OpenTelemetry trace id, to look it up in Dash0
    servedBy: string;                        // pod name (or host name locally)
  };
}
```

### `GET /api/sessions/:id`
`{ session: Session; related: Session[] }` (up to 4 related). `404 not_found`.

### `POST /api/agenda`
Body `{ "ids": string[] }` (max 60). Unknown ids are ignored.

```ts
{
  items: Session[];                          // sorted by start
  conflicts: { a: string; b: string; overlapMinutes: number }[];
}
```

### `POST /api/agenda/suggest`
Body `{ "ids": string[] }` (1 to 60): the sessions already in the setlist.
Returns up to 4 sessions that **do not overlap any of them in time**, ranked
by how close they are in meaning to what was picked. One Elasticsearch
query does both: a semantic query for the ranking and date-range filters for
the free time. Unknown ids are ignored; if none is known the list is empty.

```ts
{
  basedOn: number;                           // how many picked sessions were used
  results: Session[];
}
```

### `POST /api/setlists`
Saves a setlist in Elasticsearch so it can be shared. Body
`{ "ids": string[], "name"?: string }` (1 to 60 known ids, name up to 60
characters, plain text). Unknown ids are dropped; `400` if none is known.
Limited to 20 saves per minute per server: beyond that `429 rate_limited`.

`201 { "id": string, "count": number }`. A saved setlist never changes:
sharing again creates a new one.

### `GET /api/setlists/:id`

```ts
{
  id: string;
  name: string;                              // "" when none was given
  createdAt: string;                         // ISO 8601, UTC
  items: Session[];                          // sorted by start
  conflicts: { a: string; b: string; overlapMinutes: number }[];
}
```

`404 not_found` when there is no such setlist. The frontend opens a shared
setlist from the page URL `/?setlist=<id>`.

### `GET /api/agenda.ics?ids=a,b,c`
`text/calendar` download of the chosen sessions.

### `GET /api/people`
Query string: `q` (required, 1 to 500 chars), `size` (1 to 20, default 6).
Profiles are a **demo dataset**, never real attendees.

```ts
{
  demo: true;
  query: string;
  mode: "semantic" | "keyword";
  tookMs: number;
  results: (Person & { score: number; highlight: Segment[] | null })[];
}
```

### `POST /api/ask`
Body `{ "question": string }` (1 to 500 chars). Answers only from retrieved
sessions.

```ts
{ answer: string; sources: Session[]; model: string; grounded: true }
```

`503 ask_unavailable` when no language model is configured.

### `GET /api/chaos` and `POST /api/chaos`
Body for POST: `{ "mode": "off" | "n-plus-one" }`. Returns `{ "mode": ... }`.

`GET` is public. `POST` degrades search for everyone, so on every deployed
environment it requires the header `X-Ops-Token` with the shared ops token;
a missing or wrong token is `403 forbidden`. `meta.chaos.protected` tells the
frontend whether to ask for the token. Local development (no token
configured, `DEPLOY_ENV` unset) leaves it open.

`n-plus-one` makes search enrich each hit with its own sequential
Elasticsearch query instead of one batched query. It is a real regression,
not a sleep, and exists to practice incident response.
