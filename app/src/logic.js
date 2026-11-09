'use strict';
// Pure functions: no I/O, no clock, no Elasticsearch. Everything here is unit
// tested in test/logic.test.js.

const MODES = ['hybrid', 'keyword', 'semantic'];
const A11Y_KEYS = ['captions', 'stepFree', 'signLanguage', 'lowSensory'];
// Private-use characters mark highlights on the way out of Elasticsearch.
// They must sit above U+0020: Elasticsearch trims fragments, and control
// characters at a fragment's edge were being trimmed away with the spaces.
const HL_OPEN = '\uE000';
const HL_CLOSE = '\uE001';

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const badRequest = (message) => new HttpError(400, 'bad_request', message);

function oneString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function boundedInt(value, { min, max, fallback, name }) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw badRequest(`${name} must be a whole number from ${min} to ${max}.`);
  }
  return n;
}

/** Validate and normalise the query string of GET /api/search. */
function parseSearchParams(query) {
  const q = oneString(query.q);
  if (!q) throw badRequest('q is required: describe what you want to learn.');
  if (q.length > 300) throw badRequest('q must be 300 characters or fewer.');

  const mode = oneString(query.mode) || 'hybrid';
  if (!MODES.includes(mode)) throw badRequest(`mode must be one of: ${MODES.join(', ')}.`);

  const day = oneString(query.day);
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw badRequest('day must look like YYYY-MM-DD.');

  const a11y = oneString(query.a11y)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const key of a11y) {
    if (!A11Y_KEYS.includes(key)) throw badRequest(`a11y accepts: ${A11Y_KEYS.join(', ')}.`);
  }

  return {
    q,
    mode,
    size: boundedInt(query.size, { min: 1, max: 30, fallback: 12, name: 'size' }),
    filters: {
      day: day || null,
      track: oneString(query.track).slice(0, 80) || null,
      level: oneString(query.level).slice(0, 40) || null,
      a11y: [...new Set(a11y)],
    },
  };
}

function parsePeopleParams(query) {
  const q = oneString(query.q);
  if (!q) throw badRequest('q is required: tell us what you are building.');
  if (q.length > 500) throw badRequest('q must be 500 characters or fewer.');
  return { q, size: boundedInt(query.size, { min: 1, max: 20, fallback: 6, name: 'size' }) };
}

function parseIds(value, max = 60) {
  const list = Array.isArray(value) ? value : oneString(value).split(',');
  const ids = [];
  for (const raw of list) {
    if (typeof raw !== 'string') throw badRequest('ids must be strings.');
    const id = raw.trim();
    if (!id) continue;
    if (!/^[a-z0-9-]{1,80}$/.test(id)) throw badRequest('ids may only contain lowercase letters, digits and dashes.');
    ids.push(id);
  }
  const unique = [...new Set(ids)];
  if (unique.length > max) throw badRequest(`At most ${max} ids are allowed.`);
  return unique;
}

/** Validate the body of POST /api/setlists. The name is stored and shown as plain text. */
function parseSetlistBody(body) {
  if (!body || !Array.isArray(body.ids)) {
    throw badRequest('Send a JSON body like {"ids": ["s-..."], "name": "optional"}.');
  }
  const ids = parseIds(body.ids);
  if (ids.length === 0) throw badRequest('A setlist needs at least one talk.');
  let name = '';
  if (body.name !== undefined && body.name !== null) {
    if (typeof body.name !== 'string') throw badRequest('name must be text.');
    name = body.name
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (name.length > 60) throw badRequest('name must be 60 characters or fewer.');
  }
  return { ids, name };
}

/** A setlist id from the URL. Anything that cannot be one is simply "not found". */
function parseSetlistId(value) {
  const id = oneString(value);
  if (!/^[A-Za-z0-9_-]{8,24}$/.test(id)) throw new HttpError(404, 'not_found', 'No setlist with that id.');
  return id;
}

/**
 * A small sliding-window limiter for public write endpoints. It is per
 * process, so it bounds what one pod will accept, not the whole deployment.
 */
function createRateLimiter({ limit, windowMs, now = () => Date.now() }) {
  let stamps = [];
  return {
    take() {
      const cutoff = now() - windowMs;
      stamps = stamps.filter((t) => t > cutoff);
      if (stamps.length >= limit) return false;
      stamps.push(now());
      return true;
    },
  };
}

/**
 * Turn Elasticsearch highlight text (wrapped in private marker characters,
 * never HTML) into segments the frontend renders as plain text and <mark>.
 */
function toSegments(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  const segments = [];
  let rest = text;
  while (rest.length > 0) {
    const open = rest.indexOf(HL_OPEN);
    if (open === -1) {
      segments.push({ text: rest, hit: false });
      break;
    }
    if (open > 0) segments.push({ text: rest.slice(0, open), hit: false });
    const close = rest.indexOf(HL_CLOSE, open + 1);
    if (close === -1) {
      segments.push({ text: rest.slice(open + 1), hit: true });
      break;
    }
    segments.push({ text: rest.slice(open + 1, close), hit: true });
    rest = rest.slice(close + 1);
  }
  const clean = segments.filter((s) => s.text.length > 0);
  return clean.length > 0 ? clean : null;
}

function hitTerms(segments, limit = 2) {
  if (!segments) return [];
  const seen = new Set();
  const out = [];
  for (const s of segments) {
    const key = s.text.toLowerCase();
    if (!s.hit || seen.has(key)) continue;
    seen.add(key);
    out.push(s.text);
    if (out.length === limit) break;
  }
  return out;
}

/** What experience level is the person asking for, if they said so? */
function levelIntent(q) {
  const text = q.toLowerCase();
  if (/\b(new to|beginner|beginners|intro|introduction|getting started|first time|never used|101|from scratch)\b/.test(text)) {
    return 'Beginner';
  }
  if (/\b(advanced|deep dive|internals|expert|under the hood)\b/.test(text)) return 'Advanced';
  return null;
}

// Words people use when they ask in full sentences. They carry no topic, so
// the keyword leg ignores them ("Go" the language is deliberately absent).
const CONVERSATIONAL = new Set(
  (
    'a about also am an and any are as at attend be been but by can could did do does for from get getting ' +
    'had has have how i if im in interested into is it its just know learn like looking me my need new of on ' +
    'or our really relatively session sessions should so some stop talk talks that the their them there these ' +
    'this those to understand up very want was we what when where which who why will with would you your'
  ).split(' ')
);

/**
 * The topic words of a natural-language question, for the keyword leg of the
 * search. "How do I stop getting woken up by useless pages" becomes
 * "woken useless pages". Falls back to the original text if nothing is left.
 */
function keywordText(q) {
  const kept = q
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9+#.-]+/)
    .map((word) => word.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((word) => word.length > 0 && !CONVERSATIONAL.has(word));
  return kept.length > 0 ? kept.join(' ') : q;
}

/** Short, deterministic reasons a session matched. No model involved. */
function whyReasons({ session, ranks, highlights, q }) {
  const reasons = [];
  const titleTerms = hitTerms(highlights.title);
  const descriptionTerms = hitTerms(highlights.description);
  if (titleTerms.length > 0) {
    reasons.push(`Title mentions ${titleTerms.map((t) => `“${t}”`).join(' and ')}`);
  } else if (descriptionTerms.length > 0) {
    reasons.push(`Description mentions ${descriptionTerms.map((t) => `“${t}”`).join(' and ')}`);
  }

  const words = new Set(q.toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean));
  const tags = session.tags.filter((tag) => words.has(tag.toLowerCase())).slice(0, 3);
  if (tags.length > 0) reasons.push(`Tagged ${tags.join(', ')}`);

  if (ranks.semantic !== null && (ranks.keyword === null || ranks.semantic < ranks.keyword)) {
    reasons.push(
      ranks.keyword === null
        ? 'Close in meaning to what you asked, even without the same words'
        : 'Close in meaning to what you asked'
    );
  }

  const intent = levelIntent(q);
  if (intent && session.level === intent) {
    reasons.push(intent === 'Beginner' ? 'Beginner friendly, as you asked' : 'Advanced, as you asked');
  }
  return reasons.slice(0, 3);
}

/**
 * Pairs of sessions that overlap in time. Compares instants, so sessions
 * written with different UTC offsets are still handled correctly.
 */
function findConflicts(sessions) {
  const sorted = [...sessions].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const conflicts = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const aEnd = Date.parse(sorted[i].end);
    for (let j = i + 1; j < sorted.length; j += 1) {
      const bStart = Date.parse(sorted[j].start);
      if (bStart >= aEnd) break;
      const overlapEnd = Math.min(aEnd, Date.parse(sorted[j].end));
      const overlapMinutes = Math.round((overlapEnd - bStart) / 60000);
      if (overlapMinutes > 0) conflicts.push({ a: sorted[i].id, b: sorted[j].id, overlapMinutes });
    }
  }
  return conflicts;
}

function icsEscape(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsDate(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Fold long lines as RFC 5545 asks (75 octets; we fold by characters at 70). */
function icsFold(line) {
  const parts = [];
  let rest = line;
  while (rest.length > 70) {
    parts.push(rest.slice(0, 70));
    rest = ` ${rest.slice(70)}`;
  }
  parts.push(rest);
  return parts.join('\r\n');
}

/** An iCalendar file for the chosen sessions. Times are written in UTC. */
function toIcs(sessions, { now = new Date(), calendarName = 'My Samba setlist' } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Samba Stack Overflow//Setlist//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
  ];
  for (const s of sessions) {
    const speakers = s.speakers.map((p) => p.name).join(', ');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@samba-stack-overflow`,
      `DTSTAMP:${icsDate(now.toISOString())}`,
      `DTSTART:${icsDate(s.start)}`,
      `DTEND:${icsDate(s.end)}`,
      `SUMMARY:${icsEscape(s.title)}`,
      `LOCATION:${icsEscape(s.room)}`,
      `DESCRIPTION:${icsEscape(speakers ? `${speakers}. ${s.description}` : s.description)}`,
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(icsFold).join('\r\n')}\r\n`;
}

module.exports = {
  A11Y_KEYS,
  HL_CLOSE,
  HL_OPEN,
  HttpError,
  MODES,
  badRequest,
  createRateLimiter,
  findConflicts,
  keywordText,
  levelIntent,
  parseIds,
  parsePeopleParams,
  parseSearchParams,
  parseSetlistBody,
  parseSetlistId,
  toIcs,
  toSegments,
  whyReasons,
};
