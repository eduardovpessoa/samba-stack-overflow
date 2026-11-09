# Search and data honesty

Elasticsearch is the product's data layer. These are the mistakes that hurt us.

## Elasticsearch calls

- **No query inside a loop over results.** One search request may make a fixed
  number of Elasticsearch round trips, whatever the page size. A `for` or
  `map` that awaits `client.search`, `client.count` or `client.get` per hit is
  an N+1 bug: ask for a single batched query (`terms`, `ids`, an aggregation,
  or `_msearch`). The only allowed exception is the `sequential` strategy in
  `speakerOtherTalks`, which exists to reproduce that incident on purpose and
  must stay behind the chaos switch.
- Independent requests run in parallel with `Promise.all`, not one after another.
- All Elasticsearch access goes through `app/src/store/elastic.js`. Flag a
  `Client` created or used anywhere else.
- Never build a query by concatenating user input into a query string or a
  script. User text only ever appears as a `query` value.
- Filters belong in `bool.filter` so they are cached and do not change scores.

## Never invent data

- Accessibility fields are `"yes" | "no" | "unknown"`. `unknown` must reach the
  user as "Not published". Flag code that treats `unknown` as `no` or `yes`,
  or that defaults a missing value.
- The offline fallback store must always report `engine: "offline-fallback"`
  and `semantic: false`. Flag anything that could show fallback results as
  Elasticsearch or semantic search.
- People are a demo dataset. Every surface that shows them must say so.
- `POST /api/ask` answers only from retrieved sessions. Flag prompt changes
  that let the model answer from general knowledge.

## Time

- Compare and sort times as instants (`Date.parse`), never as strings and
  never with the server's local timezone.
- The conference timezone comes from `/api/meta`. Flag hard-coded offsets or
  `new Date().getHours()` style logic in scheduling code.
- Sessions that end exactly when the next one starts are not a conflict.
