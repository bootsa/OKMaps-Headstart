# The gateway has no runtime dependencies; Node runs the TypeScript sources directly.
# Build from the packages folder, as the gateway uses packages/storage:
#   docker build -f gateway/Dockerfile -t okmaps-gateway packages
FROM node:26-alpine
WORKDIR /app
COPY gateway/package.json ./gateway/
COPY gateway/src ./gateway/src
COPY storage/package.json ./storage/
COPY storage/src ./storage/src
# What pnpm's workspace link does: @okmaps/storage is the storage folder.
RUN mkdir -p gateway/node_modules/@okmaps && ln -s ../../../storage gateway/node_modules/@okmaps/storage
WORKDIR /app/gateway
USER node
ENV PORT=8787
EXPOSE 8787
CMD ["node", "src/server.ts"]
