'use strict';
// Elasticsearch is the product's data layer: sessions and demo profiles are
// indexed here, and every search, lookup and facet is an Elasticsearch call.

const crypto = require('node:crypto');
const { Client } = require('@elastic/elasticsearch');
const { HL_CLOSE, HL_OPEN, keywordText, levelIntent, toSegments } = require('../logic');
const { log, withSpan } = require('../telemetry');

const RANK_WINDOW = 50;
const SESSION_SOURCE_EXCLUDES = ['semantic'];
const PEOPLE_SOURCE_EXCLUDES = ['profile'];

function hashOf(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 10);
}

function sessionProperties() {
  const text = { type: 'text', analyzer: 'english' };
  const tri = { type: 'keyword' };
  return {
    title: { ...text, fields: { keyword: { type: 'keyword' } } },
    description: text,
    speakers: {
      properties: {
        name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
        role: { type: 'text' },
        company: { type: 'text' },
      },
    },
    track: { type: 'keyword', fields: { text } },
    format: { type: 'keyword' },
    level: { type: 'keyword' },
    room: { type: 'keyword' },
    start: { type: 'date' },
    end: { type: 'date' },
    day: { type: 'keyword' },
    tags: { type: 'keyword', fields: { text } },
    accessibility: { properties: { captions: tri, stepFree: tri, signLanguage: tri, lowSensory: tri } },
  };
}

function peopleProperties() {
  const text = { type: 'text', analyzer: 'english' };
  return {
    name: { type: 'text' },
    role: text,
    company: { type: 'text' },
    building: text,
    interests: { type: 'keyword', fields: { text } },
    lookingFor: text,
  };
}

// Sentence-sized chunks let the semantic highlighter return the one passage
// that best matches, instead of the whole description.
const CHUNKING = { strategy: 'sentence', max_chunk_size: 40, sentence_overlap: 0 };

function isAlreadyExists(err) {
  return err?.meta?.body?.error?.type === 'resource_already_exists_exception';
}

function createElasticStore({ url, apiKey, sessions, people }) {
  const client = new Client({
    node: url,
    auth: { apiKey },
    name: 'samba-stack-overflow',
    requestTimeout: 20000,
    maxRetries: 2,
  });

  // The index name carries a hash of the dataset. New data means a new index,
  // so replicas starting together never delete each other's work, and seeding
  // is idempotent because documents keep their own ids.
  const sessionsIndex = `samba-sessions-${hashOf(sessions)}`;
  const peopleIndex = `samba-people-${hashOf(people)}`;

  const state = { ready: false, reason: 'starting', semantic: false, inferenceId: null, flavor: 'unknown' };

  /** Prefer the Jina embeddings that ship with Elastic Cloud, when present. */
  async function pickInferenceId() {
    try {
      const res = await client.inference.get({ inference_id: '_all' });
      const endpoints = res.endpoints || [];
      const jina = endpoints.find(
        (e) => e.task_type === 'text_embedding' && /jina/i.test(e.inference_id) && e.inference_id.startsWith('.')
      );
      return jina ? jina.inference_id : null;
    } catch (err) {
      log('warn', 'could not list inference endpoints, using the default', { 'error.message': err.message });
      return null;
    }
  }

  /**
   * Create the index with the richest mapping this cluster accepts:
   * semantic_text with sentence chunks, then plain semantic_text, then
   * keyword-only. Returns true when the index has a semantic field.
   */
  async function ensureIndex(index, properties, semanticField, inferenceId) {
    if (await client.indices.exists({ index })) {
      const mapping = await client.indices.getMapping({ index });
      return Boolean(mapping[index]?.mappings?.properties?.[semanticField]);
    }
    const semantic = { type: 'semantic_text', ...(inferenceId ? { inference_id: inferenceId } : {}) };
    const attempts = [
      { ...properties, [semanticField]: { ...semantic, chunking_settings: CHUNKING } },
      { ...properties, [semanticField]: semantic },
      properties,
    ];
    for (let i = 0; i < attempts.length; i += 1) {
      const hasSemantic = i < 2;
      try {
        await client.indices.create({ index, mappings: { properties: attempts[i] } });
        return hasSemantic;
      } catch (err) {
        if (isAlreadyExists(err)) return ensureIndex(index, properties, semanticField, inferenceId);
        if (i === attempts.length - 1) throw err;
        log('warn', 'index mapping rejected, trying a simpler one', {
          'samba.index': index,
          'samba.attempt': i + 1,
          'error.message': err.message.slice(0, 300),
        });
      }
    }
    return false;
  }

  async function seed(index, docs, toDoc) {
    const { count } = await client.count({ index });
    if (count === docs.length) return false;
    const operations = docs.flatMap((doc) => [{ index: { _index: index, _id: doc.id } }, toDoc(doc)]);
    const res = await client.bulk({ operations, refresh: 'wait_for' }, { requestTimeout: 120000 });
    if (res.errors) {
      const first = res.items.find((item) => item.index?.error)?.index?.error;
      throw new Error(`bulk indexing failed: ${first?.type}: ${first?.reason}`);
    }
    return true;
  }

  const sessionDoc = (s, semantic) =>
    semantic ? { ...s, semantic: `${s.title}. ${s.description} Topics: ${s.tags.join(', ')}.` } : s;
  const personDoc = (p, semantic) =>
    semantic
      ? { ...p, profile: `${p.role}. ${p.building} Interested in ${p.interests.join(', ')}. ${p.lookingFor}` }
      : p;

  async function init() {
    await withSpan('samba.store.init', { 'db.system.name': 'elasticsearch' }, async (span) => {
      const info = await client.info();
      state.flavor = info.version?.build_flavor || 'default';
      state.inferenceId = await pickInferenceId();

      const sessionsSemantic = await ensureIndex(sessionsIndex, sessionProperties(), 'semantic', state.inferenceId);
      const peopleSemantic = await ensureIndex(peopleIndex, peopleProperties(), 'profile', state.inferenceId);
      const seededSessions = await seed(sessionsIndex, sessions, (s) => sessionDoc(s, sessionsSemantic));
      const seededPeople = await seed(peopleIndex, people, (p) => personDoc(p, peopleSemantic));

      state.semantic = sessionsSemantic;
      state.peopleSemantic = peopleSemantic;
      state.ready = true;
      state.reason = null;
      span.setAttributes({ 'samba.search.semantic': sessionsSemantic, 'samba.seeded': seededSessions || seededPeople });
      log('info', 'elasticsearch ready', {
        'samba.index': sessionsIndex,
        'samba.search.semantic': sessionsSemantic,
        'samba.inference_id': state.inferenceId || 'default',
        'samba.es.flavor': state.flavor,
        'samba.seeded': seededSessions || seededPeople,
      });
    });
  }

  function filterClauses(filters) {
    const out = [];
    if (filters.day) out.push({ term: { day: filters.day } });
    if (filters.track) out.push({ term: { track: filters.track } });
    if (filters.level) out.push({ term: { level: filters.level } });
    for (const key of filters.a11y) out.push({ term: { [`accessibility.${key}`]: 'yes' } });
    return out;
  }

  function lexicalQuery(q, filters) {
    const intent = levelIntent(q);
    return {
      bool: {
        must: [
          {
            multi_match: {
              // Topic words only: "how", "I" and "up" match half the schedule.
              query: keywordText(q),
              fields: ['title^3', 'tags.text^2', 'track.text^1.5', 'speakers.name^2', 'speakers.company', 'description'],
              type: 'best_fields',
              tie_breaker: 0.3,
              // Forgive typos ("kubernets") without turning "getting" into "letting".
              fuzziness: 'AUTO:5,9',
              prefix_length: 2,
            },
          },
        ],
        // "I'm new to eBPF" should lift beginner sessions, not filter the rest out.
        should: intent ? [{ term: { level: { value: intent, boost: 2 } } }] : [],
        filter: filterClauses(filters),
      },
    };
  }

  function semanticQuery(q, filters) {
    return { bool: { must: [{ semantic: { field: 'semantic', query: q } }], filter: filterClauses(filters) } };
  }

  function highlightFor(mode) {
    const fields = {
      title: { number_of_fragments: 0 },
      description: { number_of_fragments: 1, fragment_size: 200 },
    };
    if (mode !== 'keyword') fields.semantic = { type: 'semantic', number_of_fragments: 1 };
    return { pre_tags: [HL_OPEN], post_tags: [HL_CLOSE], fields };
  }

  function toSession(hit) {
    return { id: hit._id, ...hit._source };
  }

  /**
   * One search = up to three parallel Elasticsearch requests: the ranked
   * results, plus the keyword-only and meaning-only orderings so the UI can
   * show why each session ranked where it did.
   */
  async function search({ q, mode, size, filters }) {
    const used = state.semantic ? mode : 'keyword';
    const lexical = lexicalQuery(q, filters);
    const semantic = state.semantic ? semanticQuery(q, filters) : null;
    const idsOnly = { index: sessionsIndex, size: RANK_WINDOW, _source: false, track_total_hits: false };

    const main = { index: sessionsIndex, size, _source: { excludes: SESSION_SOURCE_EXCLUDES }, highlight: highlightFor(used) };
    if (used === 'hybrid') {
      main.retriever = {
        rrf: {
          retrievers: [{ standard: { query: lexical } }, { standard: { query: semantic } }],
          rank_window_size: RANK_WINDOW,
          rank_constant: 20,
        },
      };
    } else {
      main.query = used === 'semantic' ? semantic : lexical;
    }

    const [mainRes, keywordRes, semanticRes] = await Promise.all([
      client.search(main),
      client.search({ ...idsOnly, query: lexical }),
      semantic ? client.search({ ...idsOnly, query: semantic }) : null,
    ]);

    const rankOf = (res) => new Map((res?.hits.hits || []).map((h, i) => [h._id, i + 1]));
    const keywordRanks = rankOf(keywordRes);
    const semanticRanks = rankOf(semanticRes);

    const hits = mainRes.hits.hits.map((hit) => ({
      session: toSession(hit),
      score: hit._score ?? 0,
      ranks: { keyword: keywordRanks.get(hit._id) ?? null, semantic: semanticRanks.get(hit._id) ?? null },
      highlights: {
        title: toSegments(hit.highlight?.title?.[0]),
        description: toSegments(hit.highlight?.description?.[0]),
        semantic: toSegments(hit.highlight?.semantic?.[0]),
      },
    }));
    const total = typeof mainRes.hits.total === 'number' ? mainRes.hits.total : (mainRes.hits.total?.value ?? hits.length);
    return { mode: used, total, hits, roundTrips: semantic ? 3 : 2 };
  }

  const speakerNames = (session) => session.speakers.map((p) => p.name);

  /**
   * How many other sessions each hit's speakers give.
   *
   * `batched` asks Elasticsearch once for every speaker on the page.
   * `sequential` is the N+1 version: one awaited query per hit. It is kept
   * only so the chaos switch can reproduce the regression on demand.
   */
  async function speakerOtherTalks(sessionList, strategy) {
    const counts = new Map(sessionList.map((s) => [s.id, 0]));
    if (sessionList.length === 0) return { counts, roundTrips: 0 };

    if (strategy === 'sequential') {
      for (const s of sessionList) {
        const res = await client.count({
          index: sessionsIndex,
          query: {
            bool: {
              filter: [{ terms: { 'speakers.name.keyword': speakerNames(s) } }],
              must_not: [{ ids: { values: [s.id] } }],
            },
          },
        });
        counts.set(s.id, res.count);
      }
      return { counts, roundTrips: sessionList.length };
    }

    const names = [...new Set(sessionList.flatMap(speakerNames))];
    const res = await client.search({
      index: sessionsIndex,
      size: 500,
      _source: ['speakers.name'],
      query: { terms: { 'speakers.name.keyword': names } },
    });
    for (const s of sessionList) {
      const mine = new Set(speakerNames(s));
      const others = res.hits.hits.filter(
        (hit) => hit._id !== s.id && hit._source.speakers.some((p) => mine.has(p.name))
      );
      counts.set(s.id, others.length);
    }
    return { counts, roundTrips: 1 };
  }

  async function getSession(id) {
    const res = await client.get(
      { index: sessionsIndex, id, _source_excludes: SESSION_SOURCE_EXCLUDES },
      { ignore: [404] }
    );
    return res.found ? toSession(res) : null;
  }

  async function related(session, size = 4) {
    const text = `${session.title}. ${session.tags.join(', ')}`;
    const must = state.semantic
      ? { semantic: { field: 'semantic', query: text } }
      : { multi_match: { query: text, fields: ['title^2', 'tags.text^2', 'description'] } };
    const res = await client.search({
      index: sessionsIndex,
      size,
      _source: { excludes: SESSION_SOURCE_EXCLUDES },
      query: { bool: { must: [must], must_not: [{ ids: { values: [session.id] } }] } },
    });
    return res.hits.hits.map(toSession);
  }

  async function getMany(ids) {
    if (ids.length === 0) return [];
    const res = await client.search({
      index: sessionsIndex,
      size: ids.length,
      _source: { excludes: SESSION_SOURCE_EXCLUDES },
      query: { ids: { values: ids } },
      sort: [{ start: 'asc' }, { 'title.keyword': 'asc' }],
    });
    return res.hits.hits.map(toSession);
  }

  async function facets() {
    const terms = (field, order) => ({ terms: { field, size: 50, ...(order ? { order } : {}) } });
    const res = await client.search({
      index: sessionsIndex,
      size: 0,
      aggs: {
        days: terms('day', { _key: 'asc' }),
        tracks: terms('track', { _key: 'asc' }),
        levels: terms('level'),
        formats: terms('format'),
      },
    });
    const list = (name) => res.aggregations[name].buckets.map((b) => ({ key: b.key, count: b.doc_count }));
    return { days: list('days'), tracks: list('tracks'), levels: list('levels'), formats: list('formats') };
  }

  async function searchPeople({ q, size }) {
    const semantic = Boolean(state.peopleSemantic);
    const res = await client.search({
      index: peopleIndex,
      size,
      _source: { excludes: PEOPLE_SOURCE_EXCLUDES },
      query: semantic
        ? { semantic: { field: 'profile', query: q } }
        : { multi_match: { query: q, fields: ['building^2', 'interests.text^2', 'role', 'lookingFor'], fuzziness: 'AUTO' } },
      highlight: {
        pre_tags: [HL_OPEN],
        post_tags: [HL_CLOSE],
        fields: semantic
          ? { profile: { type: 'semantic', number_of_fragments: 1 } }
          : { building: { number_of_fragments: 1, fragment_size: 200 } },
      },
    });
    return {
      mode: semantic ? 'semantic' : 'keyword',
      results: res.hits.hits.map((hit) => ({
        id: hit._id,
        ...hit._source,
        score: hit._score ?? 0,
        highlight: toSegments(hit.highlight?.profile?.[0] ?? hit.highlight?.building?.[0]),
      })),
    };
  }

  // A tiny shared flag so every replica agrees on the practice incident.
  const flagsIndex = 'samba-flags';
  async function getFlag(name) {
    // A search, not a GET: a missing flag or index is an empty 200 instead of
    // a 404, so reading an unset flag never shows up as an error span.
    const res = await client.search({
      index: flagsIndex,
      size: 1,
      ignore_unavailable: true,
      allow_no_indices: true,
      query: { ids: { values: [name] } },
    });
    return res.hits.hits[0]?._source ?? null;
  }
  async function setFlag(name, value) {
    await client.index({ index: flagsIndex, id: name, document: value, refresh: true });
  }

  return {
    engine: 'elasticsearch',
    init,
    status: () => ({ ready: state.ready, reason: state.reason }),
    info: () => ({ engine: 'elasticsearch', semantic: state.semantic }),
    search,
    speakerOtherTalks,
    getSession,
    related,
    getMany,
    facets,
    searchPeople,
    getFlag,
    setFlag,
  };
}

module.exports = { createElasticStore };
