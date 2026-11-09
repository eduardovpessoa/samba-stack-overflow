# Dash0 Agent0: slow and failed searches

- **When:** 2026-11-09, during development, on telemetry from a local run against the real Elasticsearch project
- **How:** Agent0 through Dash0's MCP server (`./scripts/dash0-mcp.sh call runTask ...`), `advanced` model class
- **Asked:** "Some GET /api/search requests took more than 2 seconds while most took under 1 second, and a few requests failed. Compare slow and fast traces and tell me the root cause, with numbers. Then explain the failed requests."

## What Agent0 answered

The slow /api/search request was an N+1 query pattern. In trace `8bbefa81b4c9de2cacaf6517e19527e3` the `samba.search.enrich_speakers` span ran with `samba.enrich.strategy=sequential` and made `samba.es.round_trips=12`: 12 `count` calls to Elasticsearch, one after another. Every fast request ran the same step `batched` with 1 round trip.

Only one of the 13 /api/search requests in the window took more than 2 seconds (2.531 s, at 20:44:12 UTC). The other 10 successful ones took 0.72–1.25 s, and 2 failed.

**Slow vs fast, same query** (`q=kubernetes platform engineering&size=12`). The fast trace is `2372e88165043fb88915156d80011d27`.

| | Slow `8bbefa81…` | Fast `2372e881…` |
|---|---|---|
| GET /api/search total | 2.531 s | 0.853 s |
| `samba.search` initial `search` calls (3, run in parallel) | longest 0.656 s | longest 0.691 s |
| `samba.search.enrich_speakers` | **1.873 s** | **0.158 s** |
| `samba.enrich.strategy` | `sequential` | `batched` |
| `samba.es.round_trips` | 12 (`count` calls of 0.132–0.198 s each) | 1 (`search` call of 0.158 s) |
| `samba.enrich.sessions` | 12 | 12 |
| Spans in the trace | 36 | 14 |

- **Where the time went:** the initial search phase took the same time in both traces. The whole ~1.7 s difference is in enrichment: 12 sequential round trips of about 156 ms each, against one batched call.
- **It isn't caused by the input:** both requests enriched the same 12 sessions. Client, host, process and query were identical too.
- **How common it is:** all 10 other enrich spans in the window are `batched` with 1 round trip and took 0.148–0.271 s. The slow request is the only `sequential` one.
- **What switched it on:** `POST /api/chaos` (trace `28de1a87176430c79769f351fb2a52f6`) logged "practice incident switch changed" with `samba.chaos.mode=n-plus-one` at 20:44:12.038. The slow request started 7 ms later. A second `POST /api/chaos` (trace `24a679a08280e326d6e57533ca4b7cec`) set the mode back to `off` at 20:44:15.064. So the slowness came from the service's practice-incident switch, not from a real regression.

**The failed requests** were two 503s, each answered in about 1 ms:
- **Traces:** `311bf61bfaca1e5fa0ca782e85aaa5bf` and `3a8988ab8c48966a41e2b3e07e6d1e6e`, at 20:44:00.447 and 20:44:00.454 UTC.
- **Error:** the request handler threw `search_unavailable` with the message "Search is still warming up. Try again in a moment." The error comes from `requireReady` (`app/src/app.js:64`), which refuses the request before any search runs.
- **Cause:** the service had just restarted. It logged "listening" at about 20:43:57, its `samba.store.init` step took 3.638 s, and it logged "elasticsearch ready" at 20:44:00.646. Both requests arrived about 0.2 s before it was ready. The next request, at 20:44:01.069, succeeded.
- **Chaos switch:** n-plus-one mode was also on from 20:44:00.440 to 20:44:01.063, but the two failures were the warm-up check, not the switch.



## What we did with it

- **N+1 enrichment.** Confirmed as the practice-incident switch, not a
  regression in the default path. The default path is the batched query
  (one round trip for any page size). `.gitar/review/search-and-data.md`
  tells Gitar to flag any Elasticsearch call awaited inside a loop over
  results, and `samba.search.es_round_trips` makes a regression visible as a
  step change in Dash0.
- **503s during warm-up.** A real gap: the API refused requests correctly but
  gave clients no hint about when to come back. Every 503 now carries
  `Retry-After: 2` (`app/src/app.js`), the contract documents it
  (`docs/api.md`), a test covers it (`app/test/api.test.js`), and the
  frontend retries once before showing an error. In the cluster the
  readiness probe already keeps traffic away from a pod until the index is
  ready.
