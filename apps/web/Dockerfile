# syntax=docker/dockerfile:1
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS build
RUN corepack enable
WORKDIR /repo
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @distill/web...
COPY tsconfig.base.json ./
COPY apps/web apps/web
RUN pnpm --filter @distill/web run build

FROM nginxinc/nginx-unprivileged:1.29-alpine@sha256:0c79d56aee561a1d81c63f00eee5fb5fe29279560cdc55e91425133104c7fbe6 AS runtime
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
# Rendered by the image's own envsubst-on-templates entrypoint at container
# start, substituting ${VITE_API_URL} into the CSP below.
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 8080
