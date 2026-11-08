FROM oven/bun:1.4.3-alpine
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4105
EXPOSE 4105
CMD ["bun", "src/server.ts"]
