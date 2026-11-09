---
title: "API contract stays in sync"
description: "A change to an API route must update the contract, both sides, and the contract tests together."
type: check
when: "A pull request changes a route handler in app/src/app.js, a response shape in app/src/store/, or an API call or API type under web/src/"
actions: "Verify docs/api.md, the backend, the frontend types and app/test/api.test.js all agree; label and comment when they do not"
---

# API contract stays in sync

`docs/api.md` is the single contract between `app/` and `web/`.

When this pull request adds, removes or changes an endpoint, a query
parameter, a request body, a response field or an error code:

1. Check that `docs/api.md` describes the new behaviour.
2. Check that the backend handler and the frontend types and calls under
   `web/src` both match it.
3. Check that `app/test/api.test.js` covers the changed shape.

If any of the three is missing, add the label `contract-drift` and post one
comment listing exactly which file is out of date and what it should say.
If everything agrees, pass without commenting.

Internal refactors that do not change what crosses the HTTP boundary pass.
