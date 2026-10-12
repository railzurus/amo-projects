# Общий образ для функций в формате Yandex Cloud Functions.
# Собирается из корня репозитория; папка с обработчиками — аргумент сборки:
#   docker build -f infra/runtime/Dockerfile --build-arg HANDLERS_SRC=lead-copy-widget/yandex-cloud .
FROM node:22-alpine

ARG HANDLERS_SRC
RUN test -n "$HANDLERS_SRC" || (echo "HANDLERS_SRC build arg is required" && exit 1)

ENV NODE_ENV=production \
    PORT=8080 \
    HANDLERS_DIR=/app/handlers

WORKDIR /app
COPY infra/runtime/server.js ./server.js
COPY ${HANDLERS_SRC}/*.js ./handlers/

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1

CMD ["node", "server.js"]
