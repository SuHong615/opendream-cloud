# Build context: repo root（与 deploy/local/Dockerfile.center 一致）
#   docker build -f services/digital-human/Dockerfile -t opendream-cloud/digital-human .
FROM docker.m.daocloud.io/oven/bun:1.4.4
WORKDIR /work
COPY services/digital-human/package.json ./package.json
COPY services/digital-human/src ./src
RUN bun install --production --registry https://registry.npmmirror.com
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4106
EXPOSE 4106
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:4106/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["bun", "src/server.ts"]
