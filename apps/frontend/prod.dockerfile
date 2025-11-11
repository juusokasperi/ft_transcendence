# This is just a builder, doesnt stay up
# -------------------------------

FROM node:22-bookworm-slim

# Set working dir at repo root first
WORKDIR /work

# Enable Corepack / pnpm
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ARG PNPM_VERSION
RUN corepack enable
RUN corepack prepare pnpm@${PNPM_VERSION} --activate

# Copy workspace configs and package.json files ONLY (for better layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .config ./.config

# Copy only package.json files from workspaces needed for frontend
# This maximizes cache hits - only invalidated when dependencies change
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY packages/pong/game-logic/package.json ./packages/pong/game-logic/package.json
COPY packages/pong/render/package.json ./packages/pong/render/package.json
COPY packages/pong/shared/package.json ./packages/pong/shared/package.json
COPY packages/utils/logger/package.json ./packages/utils/logger/package.json
COPY packages/utils/metrics/package.json ./packages/utils/metrics/package.json
COPY packages/utils/spinner/package.json ./packages/utils/spinner/package.json

# Install dependencies with BuildKit cache mount for faster builds
# This layer is cached as long as package files don't change
RUN --mount=type=cache,id=pnpm-store-frontend,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Now copy source files (invalidates from here on source changes, but deps are cached)
COPY packages ./packages
COPY apps/frontend ./apps/frontend

# Build workspace libraries first (needed by frontend)
WORKDIR /work
RUN pnpm run build:libs

# Build frontend with Vite
WORKDIR /work/apps/frontend
RUN pnpm build
