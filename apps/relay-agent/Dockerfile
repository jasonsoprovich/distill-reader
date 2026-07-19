# syntax=docker/dockerfile:1
# Runs on the USER's own machine, next to their Piper/Kokoro sidecars — not
# part of the cloud deployment. Connects outbound to a cloud-hosted Distill
# instance (DISTILL_CLOUD_URL) so that instance can dispatch TTS synthesis to
# this hardware without ever needing an inbound connection into the user's
# network (see README's "Running TTS on your own hardware" section).
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/relay-agent/package.json apps/relay-agent/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/extract/package.json packages/extract/package.json
COPY packages/providers/package.json packages/providers/package.json
RUN pnpm install --frozen-lockfile --filter @distill/relay-agent... --filter @distill/shared...

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/relay-agent apps/relay-agent
COPY packages/db packages/db
COPY packages/shared packages/shared
COPY packages/extract packages/extract
COPY packages/providers packages/providers
RUN pnpm --filter @distill/relay-agent... run build

FROM base AS runtime
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml /repo/package.json ./
COPY --from=build /repo/apps/relay-agent/package.json apps/relay-agent/package.json
COPY --from=build /repo/packages/db/package.json packages/db/package.json
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/extract/package.json packages/extract/package.json
COPY --from=build /repo/packages/providers/package.json packages/providers/package.json
RUN pnpm install --frozen-lockfile --prod --filter @distill/relay-agent...
COPY --from=build /repo/apps/relay-agent/dist apps/relay-agent/dist
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/extract/dist packages/extract/dist
COPY --from=build /repo/packages/providers/dist packages/providers/dist
USER app
CMD ["node", "apps/relay-agent/dist/index.js"]
