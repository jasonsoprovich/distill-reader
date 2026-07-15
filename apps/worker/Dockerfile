# syntax=docker/dockerfile:1
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/extract/package.json packages/extract/package.json
COPY packages/providers/package.json packages/providers/package.json
RUN pnpm install --frozen-lockfile --filter @distill/worker... --filter @distill/db... --filter @distill/shared...

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/worker apps/worker
COPY packages/db packages/db
COPY packages/shared packages/shared
COPY packages/extract packages/extract
COPY packages/providers packages/providers
RUN pnpm --filter @distill/worker... run build

FROM base AS runtime
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml /repo/package.json ./
COPY --from=build /repo/apps/worker/package.json apps/worker/package.json
COPY --from=build /repo/packages/db/package.json packages/db/package.json
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/extract/package.json packages/extract/package.json
COPY --from=build /repo/packages/providers/package.json packages/providers/package.json
RUN pnpm install --frozen-lockfile --prod --filter @distill/worker...
COPY --from=build /repo/apps/worker/dist apps/worker/dist
COPY --from=build /repo/packages/db/dist packages/db/dist
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/extract/dist packages/extract/dist
COPY --from=build /repo/packages/providers/dist packages/providers/dist
RUN mkdir -p /data/audio && chown app:app /data/audio
USER app
CMD ["node", "apps/worker/dist/index.js"]
