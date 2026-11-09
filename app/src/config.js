'use strict';

const env = process.env;

module.exports = {
  port: Number(env.PORT || 8080),
  version: env.APP_VERSION || 'dev',
  team: env.TEAM_NAME || 'local',
  deployEnv: env.DEPLOY_ENV || 'local',
  // Shared secret for operator-only actions (the practice-incident switch).
  opsToken: env.OPS_TOKEN || '',
  conference: {
    name: 'Samba Cloud Native Days',
    timezone: 'America/Denver',
    dataset: 'demo',
    notice: 'Demo dataset: the sessions, speakers and people here are fictional.',
  },
  elasticsearch: {
    url: env.ELASTICSEARCH_URL || '',
    apiKey: env.ELASTICSEARCH_API_KEY || '',
  },
  openai: {
    apiKey: env.OPENAI_API_KEY || '',
    model: env.OPENAI_MODEL || 'gpt-4o-mini',
  },
  // Browser monitoring needs its own ingest-only token: the browser can read it.
  // If it is the same value as the server token, refuse to hand it out.
  rum:
    env.DASH0_OTLP_ENDPOINT && env.DASH0_RUM_TOKEN && env.DASH0_RUM_TOKEN !== env.DASH0_AUTH_TOKEN
      ? {
          endpoint: env.DASH0_OTLP_ENDPOINT,
          token: env.DASH0_RUM_TOKEN,
          serviceName: 'samba-stack-overflow-web',
        }
      : null,
};
