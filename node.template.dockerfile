# For all backend services that run on Node

# 1) Builder
FROM node:22-bookworm-slim AS builder
WORKDIR /work

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .config ./.config
COPY apps/*/package.json ./apps/*/
COPY packages/*/*/package.json ./packages/*/*/
RUN pnpm install --frozen-lockfile

# Copy only selected service + deps
ARG SERVICE_NAME
ARG SERVICE_DIR
COPY apps/${SERVICE_DIR} ./apps/${SERVICE_DIR}
COPY packages/pong/shared ./packages/pong/shared

WORKDIR /work/apps/${SERVICE_DIR}
RUN pnpm build:vite

WORKDIR /work
RUN pnpm --filter @app/${SERVICE_NAME} deploy --prod /prod/${SERVICE_DIR}


# 2) Runtime
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ARG SERVICE_DIR
COPY --from=builder /prod/${SERVICE_DIR} ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]

