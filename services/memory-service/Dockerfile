# Build context: repo root（与 deploy/local/Dockerfile.center 一致）
#   docker build -f services/memory-service/Dockerfile -t opendream-cloud/memory-service .
FROM docker.m.daocloud.io/oven/bun:1.4.4
WORKDIR /work
COPY services/memory-service/package.json ./package.json
COPY services/memory-service/src ./src
RUN bun install --production --registry https://registry.npmmirror.com
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4107
EXPOSE 4107
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:4107/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["bun", "src/server.ts"]
