# Сборка из корня виджета:
#   docker build -f server/Dockerfile -t ati-proxy .
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    HANDLERS_DIR=/app/yandex-proxy

WORKDIR /app
COPY yandex-proxy/index.js yandex-proxy/webhook.js ./yandex-proxy/
COPY server/server.js ./server/

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1

CMD ["node", "server/server.js"]
