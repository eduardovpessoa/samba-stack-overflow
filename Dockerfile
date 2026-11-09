# One image: the React frontend is built first, then served by the Node backend.

# --- 1. build the frontend ---
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ .
RUN npm run build

# --- 2. backend with production dependencies only ---
FROM node:22-alpine
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY app/ .
COPY --from=web /web/dist ./public
ARG APP_VERSION=dev
ENV PORT=8080 APP_VERSION=$APP_VERSION NODE_ENV=production
# The node image's "node" user, by number so runAsNonRoot can check it.
USER 1000
EXPOSE 8080
# --require loads OpenTelemetry before express and the Elasticsearch client.
CMD ["node", "--require", "./src/otel.js", "server.js"]
