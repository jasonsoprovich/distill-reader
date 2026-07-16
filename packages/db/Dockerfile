# syntax=docker/dockerfile:1
# One-shot migration runner, invoked by docker-compose before api/worker boot.
FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66
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
