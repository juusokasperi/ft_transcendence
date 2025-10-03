# Template for all backend services that run on Node

# 1) Builder
FROM node:22-bookworm-slim AS builder
WORKDIR /work

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# copy workspace configs
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .config ./.config

# Copy all sources, then delete everything except packege.json files. This is 
# so that the `pnpm install` command can be cached and that cache invalidated 
# only when package.json changes, not everytime that sources change.
COPY apps ./apps
COPY packages ./packages
RUN find apps packages -type f ! -name 'package.json' -delete && \
    find apps packages -type d -empty -delete

RUN pnpm install --frozen-lockfile

# Copy all source files (overwrites the package.json-only structure)
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
COPY --from=builder /prod/${SERVICE_DIR} ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]

