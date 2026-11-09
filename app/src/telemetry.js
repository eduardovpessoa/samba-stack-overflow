'use strict';
// Thin helpers over the OpenTelemetry API. When no SDK is registered (local
// runs without Dash0) every call here is a cheap no-op.

const { trace, metrics, logs, SeverityNumber, SpanStatusCode } = require('@opentelemetry/api');

const NAME = 'samba-stack-overflow';
const tracer = trace.getTracer(NAME);
const meter = metrics.getMeter(NAME);
const otelLogger = logs.getLogger(NAME);

const latencyBuckets = [10, 25, 50, 100, 200, 400, 800, 1500, 3000, 6000];

const instruments = {
  searchDuration: meter.createHistogram('samba.search.duration', {
    unit: 'ms',
    description: 'Server-side duration of a search request, including enrichment.',
    advice: { explicitBucketBoundaries: latencyBuckets },
  }),
  searchRequests: meter.createCounter('samba.search.requests', {
    description: 'Search requests by mode and outcome.',
  }),
  zeroResults: meter.createCounter('samba.search.zero_results', {
    description: 'Searches that returned no sessions. A relevance signal, not an error.',
  }),
  esRoundTrips: meter.createHistogram('samba.search.es_round_trips', {
    description: 'Elasticsearch round trips needed to answer one search. Should stay flat as results grow.',
    advice: { explicitBucketBoundaries: [1, 2, 3, 4, 6, 8, 12, 16, 24, 32] },
  }),
  agendaConflicts: meter.createCounter('samba.agenda.conflicts', {
    description: 'Schedule conflicts found while planning agendas.',
  }),
  setlistsSaved: meter.createCounter('samba.setlists.saved', {
    description: 'Setlists saved for sharing.',
  }),
  suggestions: meter.createCounter('samba.agenda.suggestions', {
    description: 'Free-time suggestion requests, by whether anything was found.',
  }),
  askDuration: meter.createHistogram('samba.ask.duration', {
    unit: 'ms',
    description: 'Duration of grounded answers, including retrieval and the model call.',
    advice: { explicitBucketBoundaries: latencyBuckets },
  }),
};

const SEVERITY = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

/**
 * Structured log to stdout (for `kubectl logs` and Radar) and to OpenTelemetry
 * (for Dash0), correlated with the active trace. Attributes must be flat
 * primitives. Never pass secrets or full user input here.
 */
function log(level, msg, attributes = {}) {
  const spanContext = trace.getActiveSpan()?.spanContext();
  const line = { ts: new Date().toISOString(), level, msg, ...attributes };
  if (spanContext) {
    line.trace_id = spanContext.traceId;
    line.span_id = spanContext.spanId;
  }
  (level === 'error' ? console.error : console.log)(JSON.stringify(line));
  otelLogger.emit({
    severityNumber: SEVERITY[level] ?? SeverityNumber.INFO,
    severityText: level.toUpperCase(),
    body: msg,
    attributes,
  });
}

/** Run `fn` inside a span. Errors are recorded on the span and rethrown. */
function withSpan(name, attributes, fn) {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      throw err;
    } finally {
      span.end();
    }
  });
}

module.exports = { instruments, log, withSpan };
