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

# Copy everything needed for install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .config ./.config

# Copy sources
COPY packages ./packages
COPY apps/frontend ./apps/frontend

# Install all dependencies at root level first
RUN pnpm install --frozen-lockfile

# Build frontend with Vite
WORKDIR /work/apps/frontend
RUN pnpm build
