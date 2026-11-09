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
  const app = createApp({ store: createOfflineStore({ sessions, people }) });
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

test('chaos switch validates its mode and round-trips', async () => {
  assert.equal((await post('/api/chaos', { mode: 'meltdown' })).status, 400);
  assert.deepEqual(await (await post('/api/chaos', { mode: 'n-plus-one' })).json(), { mode: 'n-plus-one' });
  assert.deepEqual(await (await get('/api/chaos')).json(), { mode: 'n-plus-one' });
  assert.deepEqual(await (await post('/api/chaos', { mode: 'off' })).json(), { mode: 'off' });
});
