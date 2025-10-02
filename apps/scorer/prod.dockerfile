# 1) Builder stage
# -------------------------------
FROM node:22-bookworm AS builder
# Set working dir at repo root first
WORKDIR /work
# Enable Corepack / pnpm
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
RUN corepack prepare pnpm@9.12.3 --activate

# Copy everything needed for install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .config ./.config
COPY apps/scorer/package.json ./apps/scorer/

# Install all dependencies at root level first
RUN pnpm install --frozen-lockfile

# Copy scorer source
COPY apps/scorer ./apps/scorer

# Build scorer with Vite
WORKDIR /work/apps/scorer
RUN pnpm build:vite

# Use pnpm deploy to create a clean production deployment
WORKDIR /work
RUN pnpm --filter @app/scorer deploy --prod /prod/scorer

# -------------------------------
# 2) Runtime stage
# -------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Copy the deployed scorer from pnpm deploy
COPY --from=builder /prod/scorer ./

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]
