# syntax=docker/dockerfile:1@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32

FROM ghcr.io/voidzero-dev/vite-plus:0.3.0@sha256:bca24ac970b21298430ad281f306dbe0a17be3fd1d6c9ec5f2cc73da65740b88 AS build
WORKDIR /app
COPY --chown=vp:vp package.json pnpm-lock.yaml pnpm-workspace.yaml .node-version ./
RUN vp install --frozen-lockfile
COPY --chown=vp:vp . .
RUN vp run check:ci && vp run test && vp run build
RUN cp "$(vp env which node | head -1)" /tmp/node

FROM ghcr.io/voidzero-dev/vite-plus:0.3.0@sha256:bca24ac970b21298430ad281f306dbe0a17be3fd1d6c9ec5f2cc73da65740b88 AS dependencies
WORKDIR /app
COPY --chown=vp:vp package.json pnpm-lock.yaml pnpm-workspace.yaml .node-version ./
RUN vp install --frozen-lockfile --prod

FROM debian:bookworm-slim@sha256:88200866dfff7ea7f5cbcb6ec7c8a701889efe6fe859fe64d6990e4b07ea4171 AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/irudd-plan.db \
    MIGRATIONS_DIR=/app/drizzle
WORKDIR /app
COPY --from=build /tmp/node /usr/local/bin/node
COPY --from=build --chown=65534:65534 /app/dist ./dist
COPY --from=build --chown=65534:65534 /app/drizzle ./drizzle
COPY --from=dependencies --chown=65534:65534 /app/node_modules ./node_modules
COPY --from=build --chown=65534:65534 /app/package.json ./package.json
RUN mkdir /data && chown 65534:65534 /data
USER 65534:65534
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||'3000')+'/readyz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
