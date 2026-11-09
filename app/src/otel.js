'use strict';
// Preloaded with `node --require ./src/otel.js` so OpenTelemetry can patch
// http, express and undici before the app loads them.
//
// Everything is configured through the standard OTEL_* environment variables.
// DASH0_OTLP_ENDPOINT and DASH0_AUTH_TOKEN are a convenience on top: they come
// from a Kubernetes Secret in the cluster and from .env locally.

const env = process.env;
const endpoint = env.DASH0_OTLP_ENDPOINT || env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (!endpoint) {
  console.log(JSON.stringify({ level: 'info', msg: 'telemetry disabled: no OTLP endpoint configured' }));
} else {
  env.OTEL_EXPORTER_OTLP_ENDPOINT = endpoint;
  if (env.DASH0_AUTH_TOKEN && !env.OTEL_EXPORTER_OTLP_HEADERS) {
    env.OTEL_EXPORTER_OTLP_HEADERS = `Authorization=Bearer ${env.DASH0_AUTH_TOKEN}`;
  }
  env.OTEL_EXPORTER_OTLP_PROTOCOL ||= 'http/protobuf';
  env.OTEL_SERVICE_NAME ||= 'samba-stack-overflow';
  env.OTEL_TRACES_EXPORTER ||= 'otlp';
  env.OTEL_METRICS_EXPORTER ||= 'otlp';
  env.OTEL_LOGS_EXPORTER ||= 'otlp';
  env.OTEL_METRIC_EXPORT_INTERVAL ||= '15000';
  // fs, dns, net and per-middleware router spans are noise next to the HTTP
  // and Elasticsearch spans.
  env.OTEL_NODE_DISABLED_INSTRUMENTATIONS ||= 'fs,dns,net,router';
  env.OTEL_NODE_RESOURCE_DETECTORS ||= 'env,host,os,process,container';

  const attributes = [
    env.OTEL_RESOURCE_ATTRIBUTES,
    'service.namespace=samba',
    `service.version=${env.APP_VERSION || 'dev'}`,
    `deployment.environment.name=${env.DEPLOY_ENV || 'local'}`,
  ].filter(Boolean);
  env.OTEL_RESOURCE_ATTRIBUTES = attributes.join(',');

  require('@opentelemetry/auto-instrumentations-node/register');
}
