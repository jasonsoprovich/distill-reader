# syntax=docker/dockerfile:1
# One-shot migration runner, invoked by docker-compose before api/worker boot.
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --frozen-lockfile --filter @distill/db
COPY packages/db packages/db
WORKDIR /repo/packages/db
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /repo
USER app
CMD ["pnpm", "run", "migrate"]
