'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  HL_CLOSE,
  HL_OPEN,
  HttpError,
  findConflicts,
  keywordText,
  levelIntent,
  parseIds,
  parseSearchParams,
  toIcs,
  toSegments,
  whyReasons,
} = require('../src/logic');

const session = (id, start, end, extra = {}) => ({
  id,
  title: `Talk ${id}`,
  description: 'About things.',
  speakers: [{ name: 'Ana Demo', role: 'Engineer', company: 'Fictional Co' }],
  room: 'Ipanema Room',
  level: 'Beginner',
  tags: ['ebpf', 'kubernetes'],
  start,
  end,
  ...extra,
});

test('parseSearchParams applies defaults and trims', () => {
  const p = parseSearchParams({ q: '  ebpf for beginners ' });
  assert.equal(p.q, 'ebpf for beginners');
  assert.equal(p.mode, 'hybrid');
  assert.equal(p.size, 12);
  assert.deepEqual(p.filters, { day: null, track: null, level: null, a11y: [] });
});

test('parseSearchParams rejects bad input with a 400', () => {
  const bad = [
    {},
    { q: '   ' },
    { q: 'x'.repeat(301) },
    { q: 'ok', mode: 'vibes' },
    { q: 'ok', day: '11/10/2026' },
    { q: 'ok', size: '0' },
    { q: 'ok', size: '31' },
    { q: 'ok', size: '2.5' },
    { q: 'ok', a11y: 'captions,teleport' },
    { q: ['a', 'b'] },
  ];
  for (const query of bad) {
    assert.throws(() => parseSearchParams(query), (err) => err instanceof HttpError && err.status === 400, JSON.stringify(query));
  }
});

test('parseSearchParams de-duplicates accessibility needs', () => {
  const p = parseSearchParams({ q: 'ok', a11y: 'captions, stepFree,captions' });
  assert.deepEqual(p.filters.a11y, ['captions', 'stepFree']);
});

test('parseIds accepts lists and comma strings, rejects odd characters', () => {
  assert.deepEqual(parseIds('s-a, s-b,,s-a'), ['s-a', 's-b']);
  assert.deepEqual(parseIds(['s-a', 's-b']), ['s-a', 's-b']);
  assert.throws(() => parseIds('s-a;drop'), HttpError);
  assert.throws(() => parseIds([42]), HttpError);
  assert.throws(() => parseIds(['a', 'b', 'c'], 2), HttpError);
});

test('toSegments converts marker characters and never emits HTML', () => {
  const text = `Intro to ${HL_OPEN}eBPF${HL_CLOSE} for <b>everyone</b>`;
  assert.deepEqual(toSegments(text), [
    { text: 'Intro to ', hit: false },
    { text: 'eBPF', hit: true },
    { text: ' for <b>everyone</b>', hit: false },
  ]);
  assert.equal(toSegments(''), null);
  assert.equal(toSegments(undefined), null);
});

test('toSegments tolerates an unclosed marker', () => {
  assert.deepEqual(toSegments(`a ${HL_OPEN}b`), [
    { text: 'a ', hit: false },
    { text: 'b', hit: true },
  ]);
});

test('keywordText keeps topic words and drops conversational ones', () => {
  assert.equal(keywordText('How do I stop getting woken up at 3am by useless pages?'), 'woken 3am useless pages');
  assert.equal(keywordText("I'm a backend developer interested in Kubernetes, AI agents and Go"), 'backend developer kubernetes ai agents go');
  assert.equal(keywordText('C++ and node.js on k8s'), 'c++ node.js k8s');
});

test('keywordText falls back to the original text when nothing is left', () => {
  assert.equal(keywordText('what should I attend'), 'what should I attend');
});

test('levelIntent reads beginner and advanced phrasing', () => {
  assert.equal(levelIntent("I'm relatively new to eBPF"), 'Beginner');
  assert.equal(levelIntent('deep dive into the scheduler'), 'Advanced');
  assert.equal(levelIntent('kubernetes security'), null);
});

test('whyReasons explains keyword, tag, meaning and level matches', () => {
  const reasons = whyReasons({
    session: session('s-1', '2026-11-10T10:00:00-07:00', '2026-11-10T10:35:00-07:00'),
    ranks: { keyword: 4, semantic: 1 },
    highlights: { title: [{ text: 'eBPF', hit: true }], description: null, semantic: null },
    q: "I'm new to ebpf",
  });
  assert.deepEqual(reasons, ['Title mentions “eBPF”', 'Tagged ebpf', 'Close in meaning to what you asked']);
});

test('whyReasons calls out a meaning-only match', () => {
  const reasons = whyReasons({
    session: session('s-1', '2026-11-10T10:00:00-07:00', '2026-11-10T10:35:00-07:00', { tags: [] }),
    ranks: { keyword: null, semantic: 2 },
    highlights: { title: null, description: null, semantic: null },
    q: 'seeing inside the kernel',
  });
  assert.deepEqual(reasons, ['Close in meaning to what you asked, even without the same words']);
});

test('findConflicts reports overlapping sessions with minutes', () => {
  const conflicts = findConflicts([
    session('b', '2026-11-10T10:20:00-07:00', '2026-11-10T10:55:00-07:00'),
    session('a', '2026-11-10T10:00:00-07:00', '2026-11-10T10:35:00-07:00'),
    session('c', '2026-11-10T10:35:00-07:00', '2026-11-10T11:10:00-07:00'),
  ]);
  assert.deepEqual(conflicts, [
    { a: 'a', b: 'b', overlapMinutes: 15 },
    { a: 'b', b: 'c', overlapMinutes: 20 },
  ]);
});

test('findConflicts treats back-to-back sessions as compatible', () => {
  const conflicts = findConflicts([
    session('a', '2026-11-10T10:00:00-07:00', '2026-11-10T10:35:00-07:00'),
    session('b', '2026-11-10T10:35:00-07:00', '2026-11-10T11:10:00-07:00'),
  ]);
  assert.deepEqual(conflicts, []);
});

test('findConflicts compares instants across UTC offsets', () => {
  // 17:00Z and 10:00-07:00 are the same instant.
  const conflicts = findConflicts([
    session('a', '2026-11-10T17:00:00Z', '2026-11-10T17:30:00Z'),
    session('b', '2026-11-10T10:15:00-07:00', '2026-11-10T10:45:00-07:00'),
  ]);
  assert.deepEqual(conflicts, [{ a: 'a', b: 'b', overlapMinutes: 15 }]);
});

test('toIcs writes UTC times and escapes text', () => {
  const ics = toIcs(
    [session('s-1', '2026-11-10T10:00:00-07:00', '2026-11-10T10:35:00-07:00', { title: 'Logs, traces; metrics' })],
    { now: new Date('2026-11-09T12:00:00Z') }
  );
  assert.match(ics, /BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261110T170000Z\r\n/);
  assert.match(ics, /DTEND:20261110T173500Z\r\n/);
  assert.match(ics, /SUMMARY:Logs\\, traces\\; metrics\r\n/);
  assert.match(ics, /UID:s-1@samba-stack-overflow\r\n/);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});
