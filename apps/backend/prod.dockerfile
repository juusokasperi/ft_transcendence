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
COPY apps/backend/package.json ./apps/backend/

# Install all dependencies at root level first
RUN pnpm install --frozen-lockfile

# Copy backend source
COPY apps/backend ./apps/backend

# Build backend with Vite
WORKDIR /work/apps/backend
RUN pnpm build:vite

# Use pnpm deploy to create a clean production deployment
WORKDIR /work
RUN pnpm --filter @app/api deploy --prod /prod/backend

# -------------------------------
# 2) Runtime stage
# -------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Copy the deployed backend from pnpm deploy
COPY --from=builder /prod/backend ./

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]
