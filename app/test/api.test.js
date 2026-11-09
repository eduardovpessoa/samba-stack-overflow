'use strict';
// API contract tests against the offline store: they check shapes, validation
// and error handling from docs/api.md without needing Elasticsearch.

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createApp } = require('../src/app');
const { createOfflineStore } = require('../src/store/offline');
const sessions = require('../data/sessions.json');
const people = require('../data/people.json');

let server;
let base;

before(async () => {
  // Local development: no ops token, so the practice switch is open.
  const app = createApp({ store: createOfflineStore({ sessions, people }), opsToken: '', deployEnv: 'local' });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

const get = (path) => fetch(base + path);
const post = (path, body) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('probes answer', async () => {
  assert.equal((await get('/healthz')).status, 200);
  const ready = await get('/readyz');
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { ready: true });
});

test('meta is honest about the offline fallback', async () => {
  const meta = await (await get('/api/meta')).json();
  assert.equal(meta.search.engine, 'offline-fallback');
  assert.equal(meta.search.semantic, false);
  assert.deepEqual(meta.search.modes, ['keyword']);
  assert.equal(meta.conference.dataset, 'demo');
  assert.equal(meta.facets.days.length, 3);
  assert.equal(meta.features.ask, false);
  assert.equal(meta.chaos.mode, 'off');
  assert.equal(meta.chaos.protected, false);
});

test('search returns the contract shape', async () => {
  const res = await get('/api/search?q=ebpf%20for%20beginners&size=5');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'keyword');
  assert.ok(body.results.length > 0 && body.results.length <= 5);
  const hit = body.results[0];
  for (const key of ['id', 'title', 'start', 'end', 'day', 'accessibility', 'ranks', 'highlights', 'why', 'speakerOtherTalks']) {
    assert.ok(key in hit, `missing ${key}`);
  }
  assert.match(hit.start, /[+-]\d{2}:\d{2}$/, 'times carry a UTC offset');
  assert.ok(Array.isArray(hit.why));
});

test('search filters by accessibility needs without guessing unknowns', async () => {
  const body = await (await get('/api/search?q=kubernetes&a11y=captions,stepFree&size=30')).json();
  assert.ok(body.results.length > 0);
  for (const hit of body.results) {
    assert.equal(hit.accessibility.captions, 'yes');
    assert.equal(hit.accessibility.stepFree, 'yes');
  }
});

test('bad requests use the error shape', async () => {
  for (const path of ['/api/search', '/api/search?q=x&mode=vibes', '/api/search?q=x&size=99', '/api/people']) {
    const res = await get(path);
    assert.equal(res.status, 400, path);
    const body = await res.json();
    assert.equal(body.error.code, 'bad_request');
    assert.equal(typeof body.error.message, 'string');
  }
});

test('unknown session and unknown route are 404s', async () => {
  for (const path of ['/api/sessions/s-does-not-exist', '/api/nope']) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.equal((await res.json()).error.code, 'not_found');
  }
});

test('session detail includes related sessions', async () => {
  const body = await (await get(`/api/sessions/${sessions[0].id}`)).json();
  assert.equal(body.session.id, sessions[0].id);
  assert.ok(body.related.length <= 4);
  assert.ok(body.related.every((s) => s.id !== sessions[0].id));
});

test('agenda sorts sessions and finds conflicts', async () => {
  const day = sessions.filter((s) => s.day === sessions[0].day);
  const res = await post('/api/agenda', { ids: day.map((s) => s.id).reverse() });
  const body = await res.json();
  assert.equal(body.items.length, day.length);
  const starts = body.items.map((s) => Date.parse(s.start));
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  assert.ok(body.conflicts.length > 0, 'a full day across four rooms has overlaps');
  assert.ok(body.conflicts.every((c) => c.overlapMinutes > 0));
});

test('agenda rejects a malformed body', async () => {
  assert.equal((await post('/api/agenda', { ids: 'nope' })).status, 400);
  const res = await fetch(`${base}/api/agenda`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(res.status, 400);
});

test('search says how it was answered', async () => {
  const body = await (await get('/api/search?q=kubernetes&size=3')).json();
  assert.equal(typeof body.diagnostics.roundTrips, 'number');
  assert.equal(body.diagnostics.strategy, 'batched');
  assert.equal(typeof body.diagnostics.servedBy, 'string');
  assert.ok(body.diagnostics.traceId === null || /^[0-9a-f]{32}$/.test(body.diagnostics.traceId));
});

test('free-time suggestions never clash with the picked sessions', async () => {
  const picked = sessions.filter((s) => s.day === sessions[0].day).slice(1, 4);
  const res = await post('/api/agenda/suggest', { ids: picked.map((s) => s.id) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.basedOn, picked.length);
  assert.ok(body.results.length > 0 && body.results.length <= 4);
  for (const s of body.results) {
    assert.ok(!picked.some((p) => p.id === s.id), 'never suggests what is already picked');
    for (const p of picked) {
      const clash = Date.parse(s.start) < Date.parse(p.end) && Date.parse(p.start) < Date.parse(s.end);
      assert.equal(clash, false, `${s.id} overlaps ${p.id}`);
    }
  }
});

test('suggestions need at least one talk and tolerate unknown ids', async () => {
  assert.equal((await post('/api/agenda/suggest', { ids: [] })).status, 400);
  assert.equal((await post('/api/agenda/suggest', {})).status, 400);
  const body = await (await post('/api/agenda/suggest', { ids: ['s-does-not-exist'] })).json();
  assert.deepEqual(body, { basedOn: 0, results: [] });
});

test('a setlist can be saved and opened by its id', async () => {
  const ids = [sessions[3].id, sessions[1].id, 's-does-not-exist'];
  const created = await post('/api/setlists', { ids, name: '  My   Tuesday\u0007 plan ' });
  assert.equal(created.status, 201);
  const { id, count } = await created.json();
  assert.match(id, /^[A-Za-z0-9_-]{8,24}$/);
  assert.equal(count, 2, 'unknown ids are dropped');

  const opened = await get(`/api/setlists/${id}`);
  assert.equal(opened.status, 200);
  const body = await opened.json();
  assert.equal(body.id, id);
  assert.equal(body.name, 'My Tuesday plan');
  assert.match(body.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(body.items.map((s) => s.id).sort(), [sessions[1].id, sessions[3].id].sort());
  assert.ok(Array.isArray(body.conflicts));
});

test('setlists reject bad input and unknown ids are 404s', async () => {
  for (const body of [{}, { ids: [] }, { ids: ['s-does-not-exist'] }, { ids: [sessions[0].id], name: 'x'.repeat(61) }, { ids: [sessions[0].id], name: 7 }]) {
    assert.equal((await post('/api/setlists', body)).status, 400, JSON.stringify(body).slice(0, 60));
  }
  for (const path of ['/api/setlists/AAAAAAAAAAAA', '/api/setlists/nope', '/api/setlists/..%2F..%2Fetc']) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.equal((await res.json()).error.code, 'not_found');
  }
});

test('saving setlists is limited per visitor, so one client cannot block the rest', async () => {
  let clock = 1_000_000;
  const app = createApp({ store: createOfflineStore({ sessions, people }), opsToken: '', deployEnv: 'local', now: () => clock });
  const srv = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  // The app trusts one proxy hop, so X-Forwarded-For stands in for the visitor's address.
  const save = (client, ids = [sessions[0].id]) =>
    fetch(`http://127.0.0.1:${srv.address().port}/api/setlists`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': client },
      body: JSON.stringify({ ids }),
    });
  try {
    for (let i = 0; i < 6; i += 1) assert.equal((await save('203.0.113.7')).status, 201, `save ${i + 1}`);
    const refused = await save('203.0.113.7');
    assert.equal(refused.status, 429);
    assert.equal(refused.headers.get('retry-after'), '30');
    assert.equal((await refused.json()).error.code, 'rate_limited');

    assert.equal((await save('203.0.113.8')).status, 201, 'another visitor is not affected');

    // Requests that save nothing do not spend the budget.
    for (let i = 0; i < 10; i += 1) assert.equal((await save('203.0.113.9', ['s-does-not-exist'])).status, 400);
    assert.equal((await save('203.0.113.9')).status, 201, 'invalid saves cost nothing');

    clock += 61_000;
    assert.equal((await save('203.0.113.7')).status, 201, 'the window slides');
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('the pod-wide cap is a backstop behind the per-visitor limit', async () => {
  const app = createApp({ store: createOfflineStore({ sessions, people }), opsToken: '', deployEnv: 'local', now: () => 5_000_000 });
  const srv = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const save = (client) =>
    fetch(`http://127.0.0.1:${srv.address().port}/api/setlists`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': client },
      body: JSON.stringify({ ids: [sessions[0].id] }),
    });
  try {
    for (let i = 0; i < 30; i += 1) assert.equal((await save(`198.51.100.${i}`)).status, 201, `visitor ${i}`);
    assert.equal((await save('198.51.100.200')).status, 429, 'a new visitor is refused once the pod cap is reached');
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('calendar export is an ics download', async () => {
  const res = await get(`/api/agenda.ics?ids=${sessions[0].id}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/calendar/);
  assert.match(await res.text(), /BEGIN:VEVENT/);
});

test('people search is labelled as demo data', async () => {
  const body = await (await get('/api/people?q=healthcare%20scheduling%20with%20Go%20and%20PostgreSQL')).json();
  assert.equal(body.demo, true);
  assert.ok(body.results.length > 0);
});

test('ask reports itself unavailable without a model', async () => {
  const res = await post('/api/ask', { question: 'What should I attend for observability?' });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, 'ask_unavailable');
});

test('a store that is still warming up answers 503 with Retry-After', async () => {
  const warming = { ...createOfflineStore({ sessions, people }), status: () => ({ ready: false, reason: 'starting' }) };
  const app = createApp({ store: warming });
  const srv = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    const url = `http://127.0.0.1:${srv.address().port}`;
    const res = await fetch(`${url}/api/search?q=ebpf`);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('retry-after'), '2');
    assert.equal((await res.json()).error.code, 'search_unavailable');
    const ready = await fetch(`${url}/readyz`);
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), { ready: false, reason: 'starting' });
    assert.equal((await fetch(`${url}/healthz`)).status, 200, 'liveness ignores dependencies');
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('the practice switch needs the ops token once one is configured', async () => {
  const app = createApp({ store: createOfflineStore({ sessions, people }), opsToken: 'test-ops-token', deployEnv: 'hackathon' });
  const srv = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const url = `http://127.0.0.1:${srv.address().port}`;
  const flip = (headers) =>
    fetch(`${url}/api/chaos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ mode: 'n-plus-one' }),
    });
  try {
    for (const headers of [{}, { 'x-ops-token': 'wrong-ops-token' }, { 'x-ops-token': 'test-ops-token-and-more' }]) {
      const res = await flip(headers);
      assert.equal(res.status, 403, JSON.stringify(headers));
      assert.equal((await res.json()).error.code, 'forbidden');
    }
    assert.deepEqual(await (await fetch(`${url}/api/chaos`)).json(), { mode: 'off' }, 'refused calls change nothing');
    assert.equal((await (await fetch(`${url}/api/meta`)).json()).chaos.protected, true);

    const ok = await flip({ 'x-ops-token': 'test-ops-token' });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { mode: 'n-plus-one' });
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('a deployed environment without an ops token keeps the switch locked', async () => {
  const app = createApp({ store: createOfflineStore({ sessions, people }), opsToken: '', deployEnv: 'hackathon' });
  const srv = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/chaos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ops-token': '' },
      body: JSON.stringify({ mode: 'n-plus-one' }),
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, 'forbidden');
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('chaos switch validates its mode and round-trips', async () => {
  assert.equal((await post('/api/chaos', { mode: 'meltdown' })).status, 400);
  assert.deepEqual(await (await post('/api/chaos', { mode: 'n-plus-one' })).json(), { mode: 'n-plus-one' });
  assert.deepEqual(await (await get('/api/chaos')).json(), { mode: 'n-plus-one' });
  assert.deepEqual(await (await post('/api/chaos', { mode: 'off' })).json(), { mode: 'off' });
});
