# 1) Builder stage
# -------------------------------
FROM node:22-bookworm-slim AS builder
# Set working dir at repo root first
WORKDIR /work
# Enable Corepack / pnpm
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ARG PNPM_VERSION
RUN corepack enable
RUN corepack prepare pnpm@${PNPM_VERSION} --activate

# Copy everything needed for install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .config ./.config
COPY apps/frontend/package.json ./apps/frontend/

# Install all dependencies at root level first
RUN pnpm install --frozen-lockfile

# Copy frontend source
COPY apps/frontend ./apps/frontend

# Build frontend with Vite
WORKDIR /work/apps/frontend
CMD ["pnpm", "build"]
