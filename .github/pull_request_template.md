## What changed and why

<!-- One or two sentences a tired reviewer can follow. -->

## How I checked it

- [ ] `npm test` in `app/`
- [ ] `npm run build` in `web/`
- [ ] Tried it in the browser, keyboard only

## Contract and data

- [ ] `docs/api.md` still matches both sides (or this PR updates all of them)
- [ ] No Elasticsearch call inside a loop over results
- [ ] Nothing invented: `unknown` stays "Not published", demo data is labelled
- [ ] No secrets, and no query text in logs or telemetry

## After merge

Merging to `main` deploys through Argo CD. Check the rollout in Radar and the
`samba.search.duration` chart in Dash0.
