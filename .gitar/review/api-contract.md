# API contract

The backend (`app/`) and the frontend (`web/`) only agree through the contract
below. Review every change to a route handler, a response shape, or a
`web/src` API call against it.

- A change to a request or response shape must update `docs/api.md`, the
  backend, the frontend types, and `app/test/api.test.js` in the same pull
  request. Flag a pull request that changes only one side.
- Every non-2xx JSON response uses `{ "error": { "code", "message" } }`. Flag
  handlers that send a bare string, a stack trace, or another shape.
- Validate input at the edge in `app/src/logic.js` (`parseSearchParams`,
  `parseIds`, ...) and throw `HttpError`. Flag handlers that read `req.query`
  or `req.body` fields without a length or range limit.
- Highlights cross the API as `Segment[]`, never as HTML. Flag any
  `dangerouslySetInnerHTML`, `innerHTML`, or highlight tags such as `<em>` or
  `<mark>` produced on the server.

@../../docs/api.md
