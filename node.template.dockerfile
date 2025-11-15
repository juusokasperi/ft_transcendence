# Template for all backend services that run on Node

# 1) Builder
FROM node:22-bookworm-slim AS builder
WORKDIR /work

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Copy workspace configs and package.json files ONLY (for better layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .config ./.config

# Copy only package.json files from all workspaces to maximize cache hits
# When only source code changes, this layer remains cached
# Handle both direct and nested package.json files (e.g., packages/pong/game-logic/package.json)
COPY apps/allocator/package.json ./apps/allocator/package.json
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/chat/package.json ./apps/chat/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY apps/game-gateway/package.json ./apps/game-gateway/package.json
COPY apps/game-server/package.json ./apps/game-server/package.json
COPY apps/matchmaking/package.json ./apps/matchmaking/package.json
COPY apps/scorer/package.json ./apps/scorer/package.json
COPY packages/pong/game-logic/package.json ./packages/pong/game-logic/package.json
COPY packages/pong/render/package.json ./packages/pong/render/package.json
COPY packages/pong/shared/package.json ./packages/pong/shared/package.json
COPY packages/utils/logger/package.json ./packages/utils/logger/package.json
COPY packages/utils/metrics/package.json ./packages/utils/metrics/package.json

# help with cache invalidation for next step
COPY pnpm-lock.yaml ./
# Install dependencies with BuildKit cache mount for faster builds
# This layer is cached as long as package files don't change
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Now copy source files (invalidates from here on source changes, but deps are cached)
COPY apps ./apps
COPY packages ./packages

# these are set in compose file
ARG SERVICE_NAME
ARG SERVICE_DIR

WORKDIR /work/apps/${SERVICE_DIR}
RUN pnpm build:vite

WORKDIR /work
RUN pnpm --filter @app/${SERVICE_NAME} deploy --prod /prod/${SERVICE_DIR}


# 2) Runtime
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ARG SERVICE_DIR
ARG INSTALL_SQLITE=false

# Conditionally install sqlite3 CLI (only for services that need it, e.g., backend)
RUN if [ "$INSTALL_SQLITE" = "true" ]; then \
      apt-get update && \
      apt-get install -y sqlite3 && \
      rm -rf /var/lib/apt/lists/*; \
    fi

COPY --from=builder /prod/${SERVICE_DIR} ./
ENV NODE_ENV=production

# Currently used by backend
# creates unnecessary empty directories in some services
RUN mkdir -p /data ./data ./db
RUN chown -R node:node /data ./data ./db

# drop root
USER node

CMD ["node", "dist/index.js"]

