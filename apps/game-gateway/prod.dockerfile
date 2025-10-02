# 1) Builder stage
# -------------------------------
FROM node:22-bookworm-slim AS builder
# Set working dir at repo root first
WORKDIR /work
# Enable Corepack / pnpm
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
RUN corepack prepare pnpm@9.12.3 --activate

# Copy everything needed for install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .config ./.config
COPY apps/game-gateway/package.json ./apps/game-gateway/
COPY packages/pong/shared/package.json ./packages/pong/shared/

# Install all dependencies at root level first
RUN pnpm install --frozen-lockfile

# Copy game-gateway source
COPY apps/game-gateway ./apps/game-gateway
COPY packages/pong/shared ./packages/pong/shared

# Build game-gateway with Vite
WORKDIR /work/apps/game-gateway
RUN pnpm build:vite

# Use pnpm deploy to create a clean production deployment
WORKDIR /work
RUN pnpm --filter @app/game-gateway deploy --prod /prod/game-gateway

# -------------------------------
# 2) Runtime stage
# -------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Copy the deployed game-gateway from pnpm deploy
COPY --from=builder /prod/game-gateway ./

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]
