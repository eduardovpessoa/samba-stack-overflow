'use strict';
// Grounded answers: retrieve sessions from the search store first, then let a
// language model answer ONLY from those sessions. Optional: without an API key
// the feature reports itself as unavailable and the rest of the app works.

const { HttpError } = require('./logic');
const { log, withSpan } = require('./telemetry');

const SYSTEM_PROMPT = [
  'You are the Samba Stack Overflow conference assistant.',
  'Answer only from the SESSIONS provided. Never invent sessions, speakers, rooms, times or accessibility details.',
  'If the sessions do not answer the question, say so plainly.',
  'Recommend at most four sessions. Refer to each by its exact title and say in one sentence why it fits.',
  'Accessibility values of "unknown" mean the organisers have not published them: say "not published".',
  'Keep the answer under 140 words. Plain text, no markdown.',
].join(' ');

function sessionContext(s) {
  return [
    `id: ${s.id}`,
    `title: ${s.title}`,
    `when: ${s.start} to ${s.end}`,
    `room: ${s.room}`,
    `level: ${s.level}`,
    `track: ${s.track}`,
    `speakers: ${s.speakers.map((p) => `${p.name} (${p.company})`).join(', ')}`,
    `captions: ${s.accessibility.captions}, step-free: ${s.accessibility.stepFree}`,
    `description: ${s.description}`,
  ].join('\n');
}

function createAsk({ store, openai, fetchImpl = fetch }) {
  const available = Boolean(openai.apiKey);

  async function answer(question) {
    const retrieved = await store.search({
      q: question,
      mode: 'hybrid',
      size: 6,
      filters: { day: null, track: null, level: null, a11y: [] },
    });
    const sources = retrieved.hits.map((h) => h.session);
    if (sources.length === 0) {
      return {
        answer: 'I could not find any sessions about that in the schedule.',
        sources: [],
        model: 'none',
        grounded: true,
      };
    }

    const text = await withSpan(
      `chat ${openai.model}`,
      { 'gen_ai.operation.name': 'chat', 'gen_ai.provider.name': 'openai', 'gen_ai.request.model': openai.model },
      async (span) => {
        const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${openai.apiKey}` },
          signal: AbortSignal.timeout(25000),
          body: JSON.stringify({
            model: openai.model,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `SESSIONS:\n\n${sources.map(sessionContext).join('\n\n')}\n\nQUESTION: ${question}` },
            ],
          }),
        });
        if (!res.ok) {
          log('error', 'language model request failed', { 'http.response.status_code': res.status });
          throw new HttpError(503, 'ask_unavailable', 'The language model did not answer. Search still works.');
        }
        const data = await res.json();
        span.setAttributes({
          'gen_ai.response.model': data.model || openai.model,
          'gen_ai.usage.input_tokens': data.usage?.prompt_tokens ?? 0,
          'gen_ai.usage.output_tokens': data.usage?.completion_tokens ?? 0,
        });
        return data.choices?.[0]?.message?.content?.trim() || '';
      }
    );

    if (!text) throw new HttpError(503, 'ask_unavailable', 'The language model returned an empty answer.');
    return { answer: text, sources, model: openai.model, grounded: true };
  }

  return { available, answer };
}

module.exports = { createAsk };
