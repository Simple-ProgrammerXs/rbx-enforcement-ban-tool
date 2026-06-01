FROM oven/bun:1.3.5-slim

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV DASHBOARD_HOST=0.0.0.0
ENV DATA_DIR=/app/data

COPY --chown=bun:bun package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY --chown=bun:bun . .
RUN bun run build
RUN mkdir -p /app/config /app/data

EXPOSE 3000

CMD ["sh", "-c", "export DASHBOARD_PORT=${DASHBOARD_PORT:-${PORT:-3000}}; exec bun run start"]
