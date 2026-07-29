# syntax=docker/dockerfile:1
#
# Build from the repository root so the workspace is inside the context:
#   docker build -f docker/api.Dockerfile -t plotpop-api .
#
# The worker image is deliberately a separate file rather than a shared
# parameterised one: the two services scale and deploy independently (ADR-001),
# and CI names each image explicitly.

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
# The repository's git hooks are irrelevant inside a build context that has no
# .git directory, and husky's prepare script fails noisily without one.
ENV HUSKY=0
# Manifests first: the dependency layer stays cached until a manifest changes.
# Every workspace manifest is copied because pnpm resolves the whole workspace
# against the lockfile even when the install is filtered.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/observability/package.json packages/observability/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @plotpop/api...

COPY tooling ./tooling
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @plotpop/api build

# `deploy` writes a self-contained tree: compiled output, production
# dependencies only, and the workspace packages resolved into place.
RUN pnpm --filter @plotpop/api --prod --legacy deploy /out

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./

# Runs unprivileged: the image ships no build tooling and needs no write access
# outside the media temp dir a later slice mounts.
USER node
EXPOSE 3001

# Liveness only. Readiness reports on Postgres, Redis and storage, which is
# compose's business through depends_on, not a reason to restart this container.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "dist/index.js"]
