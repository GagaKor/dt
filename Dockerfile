FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
# VITE_E2E is intentionally unset so the e2e hooks stay out of the production bundle.
RUN pnpm --filter @dt/web build && pnpm --filter @dt/server build
RUN pnpm --filter @dt/server deploy --prod /out \
  && cp -r apps/server/dist /out/dist \
  && cp -r apps/server/drizzle /out/drizzle \
  && cp -r apps/web/dist /out/web

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    WEB_DIST_DIR=/app/web \
    MIGRATIONS_DIR=/app/drizzle \
    STORAGE_LOCAL_DIR=/data/storage
WORKDIR /app
COPY --from=build /out/ ./
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
