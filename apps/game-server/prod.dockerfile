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
COPY apps/game-server/package.json ./apps/game-server/
COPY packages/pong/game-logic/package.json ./packages/pong/game-logic/
COPY packages/pong/shared/package.json ./packages/pong/shared/

# Install all dependencies at root level first
RUN pnpm install --frozen-lockfile

# Copy game-server source
COPY packages/pong/game-logic ./packages/pong/game-logic
COPY packages/pong/shared ./packages/pong/shared
COPY apps/game-server ./apps/game-server

# Build game-server with Vite
WORKDIR /work/apps/game-server
RUN pnpm build:vite

# Use pnpm deploy to create a clean production deployment
WORKDIR /work
RUN pnpm --filter @app/game-server deploy --prod /prod/game-server

# -------------------------------
# 2) Runtime stage
# -------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Copy the deployed game-server from pnpm deploy
COPY --from=builder /prod/game-server ./

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]
