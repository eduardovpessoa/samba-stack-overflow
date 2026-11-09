'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { isSpanContextValid, trace } = require('@opentelemetry/api');
const config = require('./config');
const { createAsk } = require('./ask');
const {
  HttpError,
  badRequest,
  createRateLimiter,
  findConflicts,
  parseIds,
  parsePeopleParams,
  parseSearchParams,
  parseSetlistBody,
  parseSetlistId,
  toIcs,
  whyReasons,
} = require('./logic');
const { instruments, log, withSpan } = require('./telemetry');

const CHAOS_MODES = ['off', 'n-plus-one'];
const CHAOS_TTL_MS = 10 * 60 * 1000; // a practice incident switches itself off
const CHAOS_CACHE_MS = 3000;
const FACETS_CACHE_MS = 60 * 1000;
// Per visitor, and a larger cap per pod as a backstop.
const SETLIST_SAVES_PER_CLIENT = 6;
const SETLIST_SAVES_PER_POD = 30;
// The pod name in the cluster, the host name on a laptop.
const SERVED_BY = process.env.POD_NAME || os.hostname();

/** The id of the trace this request belongs to, or null when tracing is off. */
function currentTraceId() {
  const context = trace.getActiveSpan()?.spanContext();
  return context && isSpanContextValid(context) ? context.traceId : null;
}

function createApp({ store, now = () => Date.now(), opsToken = config.opsToken, deployEnv = config.deployEnv }) {
  const app = express();
  const ask = createAsk({ store, openai: config.openai });
  app.disable('x-powered-by');
  // So req.ip is the visitor's address, not the gateway's.
  app.set('trust proxy', config.trustProxyHops);
  app.use(express.json({ limit: '32kb' }));
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
    });
    next();
  });

  // --- practice incident switch, shared by every replica through the store ---
  let chaosCache = { mode: 'off', readAt: 0 };
  async function chaosMode() {
    if (now() - chaosCache.readAt < CHAOS_CACHE_MS) return chaosCache.mode;
    let mode = 'off';
    try {
      const flag = await store.getFlag('chaos');
      if (flag && CHAOS_MODES.includes(flag.mode) && flag.expiresAt > now()) mode = flag.mode;
    } catch (err) {
      log('warn', 'could not read the chaos flag, assuming off', { 'error.message': err.message });
    }
    chaosCache = { mode, readAt: now() };
    return mode;
  }

  // The switch slows search for everyone, so on any deployed environment only
  // someone holding the ops token may flip it. Local development stays open.
  // (Found by Gitar on PR #1: the endpoint used to be open on a public URL.)
  const chaosProtected = Boolean(opsToken) || deployEnv !== 'local';
  function requireOpsToken(req) {
    if (!chaosProtected) return;
    const given = Buffer.from(String(req.get('x-ops-token') || ''));
    const expected = Buffer.from(opsToken);
    const ok = expected.length > 0 && given.length === expected.length && crypto.timingSafeEqual(given, expected);
    if (ok) return;
    log('warn', 'practice incident switch refused', { 'samba.chaos.token_configured': expected.length > 0 });
    throw new HttpError(
      403,
      'forbidden',
      expected.length > 0
        ? 'The practice switch needs a valid ops token.'
        : 'The practice switch is disabled here: no ops token is configured.'
    );
  }

  const savesByClient = createRateLimiter({ limit: SETLIST_SAVES_PER_CLIENT, windowMs: 60 * 1000, now });
  const savesByPod = createRateLimiter({ limit: SETLIST_SAVES_PER_POD, windowMs: 60 * 1000, now });

  let facetsCache = { value: null, readAt: 0 };
  async function facets() {
    if (facetsCache.value && now() - facetsCache.readAt < FACETS_CACHE_MS) return facetsCache.value;
    facetsCache = { value: await store.facets(), readAt: now() };
    return facetsCache.value;
  }

  const requireReady = (req, res, next) => {
    const status = store.status();
    if (status.ready) return next();
    return next(new HttpError(503, 'search_unavailable', 'Search is still warming up. Try again in a moment.'));
  };

  // --- probes ---
  app.get('/healthz', (req, res) => res.type('text/plain').send('ok\n'));
  app.get('/readyz', (req, res) => {
    const status = store.status();
    res.status(status.ready ? 200 : 503).json(status.ready ? { ready: true } : { ready: false, reason: status.reason });
  });

  // --- API ---
  app.get('/api/meta', requireReady, async (req, res) => {
    const info = store.info();
    res.json({
      app: { name: 'Samba Stack Overflow', version: config.version, team: config.team },
      conference: config.conference,
      search: {
        engine: info.engine,
        semantic: info.semantic,
        modes: info.semantic ? ['hybrid', 'keyword', 'semantic'] : ['keyword'],
      },
      facets: await facets(),
      features: { ask: ask.available },
      rum: config.rum,
      chaos: { mode: await chaosMode(), protected: chaosProtected },
    });
  });

  app.get('/api/search', requireReady, async (req, res) => {
    const params = parseSearchParams(req.query);
    const started = performance.now();
    let outcome = 'ok';
    let modeUsed = params.mode;
    try {
      const body = await withSpan(
        'samba.search',
        { 'samba.search.mode': params.mode, 'samba.search.query_length': params.q.length },
        async (span) => {
          const result = await store.search(params);
          modeUsed = result.mode;

          const strategy = (await chaosMode()) === 'n-plus-one' ? 'sequential' : 'batched';
          const enrichment = await withSpan(
            'samba.search.enrich_speakers',
            { 'samba.enrich.strategy': strategy, 'samba.enrich.sessions': result.hits.length },
            async (enrichSpan) => {
              const out = await store.speakerOtherTalks(result.hits.map((h) => h.session), strategy);
              enrichSpan.setAttribute('samba.es.round_trips', out.roundTrips);
              return out;
            }
          );

          const roundTrips = result.roundTrips + enrichment.roundTrips;
          span.setAttributes({
            'samba.search.mode_used': result.mode,
            'samba.search.results': result.hits.length,
            'samba.search.total': result.total,
            'samba.es.round_trips': roundTrips,
            'samba.enrich.strategy': strategy,
          });
          instruments.esRoundTrips.record(roundTrips, { 'samba.search.mode': result.mode, 'samba.enrich.strategy': strategy });

          return {
            query: params.q,
            mode: result.mode,
            engine: store.engine,
            total: result.total,
            diagnostics: { roundTrips, strategy, traceId: currentTraceId(), servedBy: SERVED_BY },
            results: result.hits.map((hit) => ({
              ...hit.session,
              score: hit.score,
              ranks: hit.ranks,
              highlights: hit.highlights,
              why: whyReasons({ session: hit.session, ranks: hit.ranks, highlights: hit.highlights, q: params.q }),
              speakerOtherTalks: enrichment.counts.get(hit.session.id) ?? 0,
            })),
          };
        }
      );

      const tookMs = Math.round(performance.now() - started);
      if (body.results.length === 0) {
        outcome = 'zero_results';
        instruments.zeroResults.add(1, { 'samba.search.mode': modeUsed });
      }
      log('info', 'search served', {
        'samba.search.mode': modeUsed,
        'samba.search.results': body.results.length,
        'samba.search.took_ms': tookMs,
        'samba.search.query_length': params.q.length,
      });
      res.json({
        query: body.query,
        mode: body.mode,
        engine: body.engine,
        tookMs,
        total: body.total,
        results: body.results,
        diagnostics: body.diagnostics,
      });
    } catch (err) {
      outcome = 'error';
      throw err;
    } finally {
      const attributes = { 'samba.search.mode': modeUsed, 'samba.search.outcome': outcome };
      instruments.searchDuration.record(performance.now() - started, attributes);
      instruments.searchRequests.add(1, attributes);
    }
  });

  app.get('/api/sessions/:id', requireReady, async (req, res) => {
    const [id] = parseIds(req.params.id, 1);
    const session = id ? await store.getSession(id) : null;
    if (!session) throw new HttpError(404, 'not_found', 'No session with that id.');
    res.json({ session, related: await store.related(session, 4) });
  });

  app.post('/api/agenda', requireReady, async (req, res) => {
    if (!req.body || !Array.isArray(req.body.ids)) throw badRequest('Send a JSON body like {"ids": ["s-..."]}.');
    const items = await store.getMany(parseIds(req.body.ids));
    const conflicts = findConflicts(items);
    if (conflicts.length > 0) instruments.agendaConflicts.add(conflicts.length);
    res.json({ items, conflicts });
  });

  app.post('/api/agenda/suggest', requireReady, async (req, res) => {
    if (!req.body || !Array.isArray(req.body.ids)) throw badRequest('Send a JSON body like {"ids": ["s-..."]}.');
    const ids = parseIds(req.body.ids);
    if (ids.length === 0) throw badRequest('Pick at least one talk first.');
    const results = await withSpan('samba.agenda.suggest', { 'samba.agenda.picked': ids.length }, async (span) => {
      const picked = await store.getMany(ids);
      const found = await store.suggest(picked, 4);
      span.setAttributes({ 'samba.agenda.known': picked.length, 'samba.agenda.suggested': found.length });
      instruments.suggestions.add(1, { 'samba.agenda.outcome': found.length > 0 ? 'found' : 'none' });
      return { basedOn: picked.length, results: found };
    });
    res.json(results);
  });

  app.post('/api/setlists', requireReady, async (req, res) => {
    const { ids, name } = parseSetlistBody(req.body);
    // Anyone can call this. Each visitor gets a small budget of their own, so
    // one client cannot use up everyone's, and the pod has a larger cap behind
    // it. (Found by Gitar on PR #6: it used to be one shared bucket.)
    const client = req.ip || 'unknown';
    const refuse = () => {
      res.set('Retry-After', '30');
      throw new HttpError(429, 'rate_limited', 'Too many setlists are being shared right now. Try again in a moment.');
    };
    if (!savesByClient.allows(client) || !savesByPod.allows()) refuse();
    const known = (await store.getMany(ids)).map((s) => s.id);
    if (known.length === 0) throw badRequest('None of those talks exist.');
    // Only a save that is actually going to happen spends from the budgets.
    if (!savesByClient.take(client) || !savesByPod.take()) refuse();
    const id = crypto.randomBytes(9).toString('base64url');
    await withSpan('samba.setlist.save', { 'samba.setlist.count': known.length }, () =>
      store.saveSetlist({ id, ids: known, name, createdAt: new Date(now()).toISOString() })
    );
    instruments.setlistsSaved.add(1);
    log('info', 'setlist saved', { 'samba.setlist.count': known.length, 'samba.setlist.named': name.length > 0 });
    res.status(201).json({ id, count: known.length });
  });

  app.get('/api/setlists/:id', requireReady, async (req, res) => {
    const id = parseSetlistId(req.params.id);
    const body = await withSpan('samba.setlist.open', {}, async (span) => {
      const saved = await store.getSetlist(id);
      span.setAttribute('samba.setlist.found', Boolean(saved));
      if (!saved) throw new HttpError(404, 'not_found', 'No setlist with that id.');
      const items = await store.getMany(saved.ids);
      span.setAttribute('samba.setlist.count', items.length);
      return { id, name: saved.name || '', createdAt: saved.createdAt, items, conflicts: findConflicts(items) };
    });
    res.json(body);
  });

  app.get('/api/agenda.ics', requireReady, async (req, res) => {
    const items = await store.getMany(parseIds(req.query.ids));
    res
      .type('text/calendar; charset=utf-8')
      .set('Content-Disposition', 'attachment; filename="samba-setlist.ics"')
      .send(toIcs(items));
  });

  app.get('/api/people', requireReady, async (req, res) => {
    const params = parsePeopleParams(req.query);
    const started = performance.now();
    const out = await withSpan('samba.people.search', { 'samba.search.query_length': params.q.length }, () =>
      store.searchPeople(params)
    );
    res.json({
      demo: true,
      query: params.q,
      mode: out.mode,
      tookMs: Math.round(performance.now() - started),
      results: out.results,
    });
  });

  app.post('/api/ask', requireReady, async (req, res) => {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!question) throw badRequest('question is required.');
    if (question.length > 500) throw badRequest('question must be 500 characters or fewer.');
    if (!ask.available) {
      throw new HttpError(503, 'ask_unavailable', 'Ask is off: no language model is configured. Search still works.');
    }
    const started = performance.now();
    try {
      res.json(await ask.answer(question));
    } finally {
      instruments.askDuration.record(performance.now() - started);
    }
  });

  app.get('/api/chaos', async (req, res) => res.json({ mode: await chaosMode() }));
  app.post('/api/chaos', async (req, res) => {
    requireOpsToken(req);
    const mode = req.body?.mode;
    if (!CHAOS_MODES.includes(mode)) throw badRequest(`mode must be one of: ${CHAOS_MODES.join(', ')}.`);
    await store.setFlag('chaos', { mode, expiresAt: now() + CHAOS_TTL_MS });
    chaosCache = { mode, readAt: now() };
    log('warn', 'practice incident switch changed', { 'samba.chaos.mode': mode });
    res.json({ mode });
  });

  app.use('/api', (req, res, next) => next(new HttpError(404, 'not_found', 'No such API route.')));

  // --- frontend (built by web/, copied to app/public in the image) ---
  const publicDir = path.join(__dirname, '..', 'public');
  if (fs.existsSync(path.join(publicDir, 'index.html'))) {
    app.use(
      express.static(publicDir, {
        index: false,
        maxAge: '1h',
        setHeaders(res, filePath) {
          // The service worker and the manifest must be re-checked on every
          // load, or an installed app could keep an old one for an hour.
          if (/(^|[\\/])(sw\.js|manifest\.webmanifest)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
        },
      })
    );
    app.get(/.*/, (req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(publicDir, 'index.html')));
  } else {
    app.get('/', (req, res) =>
      res.type('text/plain').send('Samba Stack Overflow API. The frontend is not built: run `npm run build` in web/.\n')
    );
  }

  // --- errors: one shape for every failure, no stack traces to clients ---
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      // A 503 here is short-lived (index warm-up, model hiccup): tell clients
      // when to retry instead of leaving them to guess.
      if (err.status === 503) res.set('Retry-After', '2');
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
      return res.status(400).json({ error: { code: 'bad_request', message: 'The request body is not valid JSON.' } });
    }
    log('error', 'request failed', {
      'http.route': req.path,
      'error.type': err?.name || 'Error',
      'error.message': String(err?.message || err).slice(0, 500),
    });
    // Elasticsearch being unreachable, overloaded or refusing our key is an
    // outage of a dependency (503, retry later), not a bug in this request.
    const esStatus = err?.name === 'ResponseError' ? err.statusCode : null;
    const unavailable =
      err?.name === 'ConnectionError' ||
      err?.name === 'TimeoutError' ||
      [401, 403, 429].includes(esStatus) ||
      esStatus >= 500;
    if (unavailable) res.set('Retry-After', '2');
    return res.status(unavailable ? 503 : 500).json({
      error: unavailable
        ? { code: 'search_unavailable', message: 'Search is temporarily unavailable. Try again in a moment.' }
        : { code: 'internal', message: 'Something went wrong on our side.' },
    });
  });

  return app;
}

module.exports = { createApp };
