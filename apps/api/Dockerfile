# syntax=docker/dockerfile:1
FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS base
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
RUN pnpm install --frozen-lockfile --filter @distill/api... --filter @distill/db... --filter @distill/shared...

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/db packages/db
COPY packages/shared packages/shared
COPY packages/extract packages/extract
COPY packages/providers packages/providers
RUN pnpm --filter @distill/api... run build

FROM base AS runtime
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml /repo/package.json ./
COPY --from=build /repo/apps/api/package.json apps/api/package.json
COPY --from=build /repo/packages/db/package.json packages/db/package.json
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/extract/package.json packages/extract/package.json
COPY --from=build /repo/packages/providers/package.json packages/providers/package.json
RUN pnpm install --frozen-lockfile --prod --filter @distill/api...
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/packages/db/dist packages/db/dist
COPY --from=build /repo/packages/db/migrations packages/db/migrations
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/extract/dist packages/extract/dist
COPY --from=build /repo/packages/providers/dist packages/providers/dist
USER app
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
