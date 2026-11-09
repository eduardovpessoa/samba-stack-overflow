'use strict';
// Entry point. Start with `npm start` (which preloads ./src/otel.js).

const config = require('./src/config');
const { createApp } = require('./src/app');
const { createElasticStore } = require('./src/store/elastic');
const { createOfflineStore } = require('./src/store/offline');
const { log } = require('./src/telemetry');
const sessions = require('./data/sessions.json');
const people = require('./data/people.json');

const { url, apiKey } = config.elasticsearch;
const store =
  url && apiKey
    ? createElasticStore({ url, apiKey, sessions, people })
    : createOfflineStore({ sessions, people });

if (store.engine !== 'elasticsearch') {
  log('warn', 'ELASTICSEARCH_URL or ELASTICSEARCH_API_KEY is missing: running the offline fallback, not Elasticsearch');
}

// Seed in the background and keep retrying: the pod stays alive (liveness is
// fine) but is not Ready until the index exists, so no traffic reaches it.
async function initWithRetry(attempt = 1) {
  try {
    await store.init();
  } catch (err) {
    const delayMs = Math.min(30000, 1000 * 2 ** attempt);
    log('error', 'search store is not ready, will retry', {
      'error.message': String(err.message).slice(0, 500),
      'samba.retry.attempt': attempt,
      'samba.retry.delay_ms': delayMs,
    });
    setTimeout(() => initWithRetry(attempt + 1), delayMs).unref();
  }
}
initWithRetry();

const server = createApp({ store }).listen(config.port, () => {
  log('info', 'listening', { 'server.port': config.port, 'service.version': config.version, 'samba.engine': store.engine });
});

// Exit cleanly when Kubernetes stops the pod, so rollouts don't drop requests.
function shutdown(signal) {
  log('info', 'shutting down', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
