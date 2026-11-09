'use strict';
// Offline fallback for local development without Elasticsearch credentials.
// It is deliberately crude word matching and is always reported to the client
// as engine "offline-fallback", never as Elasticsearch or semantic search.

const STOP = new Set(
  'a an and are as at be but by for from how i im in is it my of on or so that the to what which who with you your new'.split(' ')
);

function tokens(text) {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function segmentsFor(text, wanted) {
  const parts = String(text).split(/([A-Za-z0-9+#]+)/);
  let any = false;
  const segments = [];
  for (const part of parts) {
    if (!part) continue;
    const hit = wanted.has(part.toLowerCase());
    any = any || hit;
    const last = segments[segments.length - 1];
    if (last && last.hit === hit) last.text += part;
    else segments.push({ text: part, hit });
  }
  return any ? segments : null;
}

function createOfflineStore({ sessions, people }) {
  const flags = new Map();

  function matches(session, filters) {
    if (filters.day && session.day !== filters.day) return false;
    if (filters.track && session.track !== filters.track) return false;
    if (filters.level && session.level !== filters.level) return false;
    return filters.a11y.every((key) => session.accessibility[key] === 'yes');
  }

  function score(wanted, fields) {
    let total = 0;
    for (const [text, weight] of fields) {
      for (const token of tokens(text)) if (wanted.has(token)) total += weight;
    }
    return total;
  }

  async function search({ q, size, filters }) {
    const wanted = new Set(tokens(q));
    const ranked = sessions
      .filter((s) => matches(s, filters))
      .map((s) => ({
        session: s,
        score: score(wanted, [[s.title, 3], [s.tags.join(' '), 2], [s.description, 1], [s.track, 1]]),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    const hits = ranked.slice(0, size).map((r, i) => ({
      ...r,
      ranks: { keyword: i + 1, semantic: null },
      highlights: {
        title: segmentsFor(r.session.title, wanted),
        description: segmentsFor(r.session.description.slice(0, 220), wanted),
        semantic: null,
      },
    }));
    return { mode: 'keyword', total: ranked.length, hits, roundTrips: 0 };
  }

  async function speakerOtherTalks(sessionList) {
    const counts = new Map();
    for (const s of sessionList) {
      const mine = new Set(s.speakers.map((p) => p.name));
      counts.set(s.id, sessions.filter((o) => o.id !== s.id && o.speakers.some((p) => mine.has(p.name))).length);
    }
    return { counts, roundTrips: 0 };
  }

  async function facets() {
    const count = (key) => {
      const map = new Map();
      for (const s of sessions) map.set(s[key], (map.get(s[key]) || 0) + 1);
      return [...map].map(([k, c]) => ({ key: k, count: c })).sort((a, b) => a.key.localeCompare(b.key));
    };
    return { days: count('day'), tracks: count('track'), levels: count('level'), formats: count('format') };
  }

  return {
    engine: 'offline-fallback',
    init: async () => {},
    status: () => ({ ready: true, reason: null }),
    info: () => ({ engine: 'offline-fallback', semantic: false }),
    search,
    speakerOtherTalks,
    getSession: async (id) => sessions.find((s) => s.id === id) || null,
    related: async (session, size = 4) =>
      sessions.filter((s) => s.id !== session.id && s.track === session.track).slice(0, size),
    getMany: async (ids) =>
      sessions.filter((s) => ids.includes(s.id)).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
    facets,
    searchPeople: async ({ q, size }) => {
      const wanted = new Set(tokens(q));
      const results = people
        .map((p) => ({
          ...p,
          score: score(wanted, [[p.building, 2], [p.interests.join(' '), 2], [p.role, 1], [p.lookingFor, 1]]),
          highlight: segmentsFor(p.building, wanted),
        }))
        .filter((p) => p.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, size);
      return { mode: 'keyword', results };
    },
    getFlag: async (name) => flags.get(name) || null,
    setFlag: async (name, value) => void flags.set(name, value),
  };
}

module.exports = { createOfflineStore };
