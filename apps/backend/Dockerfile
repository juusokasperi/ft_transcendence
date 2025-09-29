# -------------------------------
# 1) Builder stage
# -------------------------------
FROM node:22-bookworm AS builder

# Install corepack (pnpm)
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /work

# Copy only manifests first (better caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/
COPY packages ./packages

# Install all deps (workspace aware)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build shared libs + backend
RUN pnpm run build:libs && pnpm -F @app/api build

# -------------------------------
# 2) Runtime stage
# -------------------------------
FROM node:22-slim AS runtime

WORKDIR /app

# Copy only runtime deps
COPY --from=builder /work/node_modules ./node_modules
COPY --from=builder /work/apps/backend/node_modules ./apps/backend/node_modules

# Copy built backend
COPY --from=builder /work/apps/backend/dist ./dist
COPY --from=builder /work/apps/backend/package.json ./package.json

# Env & ports
ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/index.js"]

