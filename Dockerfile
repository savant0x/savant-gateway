# Savant Gateway — one process on one persistent volume.
#
# The storage contract (one process, one SQLite file, WAL siblings on the same
# filesystem) is enforced by the application's own startup gate and readiness
# route, not by this file. The image only has to preserve it: nothing here may
# add a second process or put the database anywhere but the mounted volume.

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# better-sqlite3 uses a prebuilt binary when one matches the ABI and compiles
# otherwise. Installing the toolchain removes the dependency on prebuild
# availability, so a build never fails on a download.
FROM base AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# `prepare` configures git hooks and cannot run without a repository. Skipping
# scripts therefore requires rebuilding the one dependency that needs its own
# install step.
RUN npm ci --ignore-scripts && npm rebuild better-sqlite3

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS prod-deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev && npm rebuild better-sqlite3

FROM base AS runner
ENV NODE_ENV=production
# better-sqlite3 is a serverExternalPackage, so it must be present at runtime.
# gosu lets the entrypoint fix a root-owned volume mount and then drop to `node`
# instead of running the server as root.
RUN apt-get update \
 && apt-get install -y --no-install-recommends gosu \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data && chown node:node /data

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/scripts/db-backup.mjs ./scripts/db-backup.mjs
COPY scripts/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
# A CRLF checkout would make the shebang unrunnable inside the image.
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh && chmod 0755 /usr/local/bin/entrypoint.sh

EXPOSE 3000

# Liveness for container restarts. Host health checks should use /api/ready.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
# `next` directly, not `npm start`: npm as PID 1 risks swallowing SIGTERM, and
# the drain in docs/deployment-runbook.md depends on the listener seeing it.
CMD ["node_modules/.bin/next", "start"]
