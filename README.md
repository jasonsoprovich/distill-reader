# Distill

A self-hosted, cybersecurity-focused RSS/API news reader. See [`docs/PLAN.md`](docs/PLAN.md) for the full build brief (architecture, data model, security requirements, phased build order).

## Monorepo layout

```
/apps
  /web        # Vite + React SPA
  /api        # Hono API server
  /worker     # feed polling / extraction / summarization / TTS
/packages
  /db         # Drizzle schema + migrations
  /shared     # shared TS types, zod schemas, constants
  /extract    # feed discovery + article extraction
  /providers  # summary + TTS provider interfaces & implementations
```

## Development

Requires Node 22 and pnpm (via `corepack enable`).

```sh
cp .env.example .env   # fill in real values
pnpm install
docker compose up -d postgres
pnpm db:generate        # generate SQL migrations from the Drizzle schema
pnpm db:migrate          # apply migrations
```

Full stack (Postgres + API + worker + web) via Docker Compose:

```sh
docker compose up --build
```

## Status

Phase 2 (feeds & ingestion) complete — see `docs/PLAN.md` §13 for the phased build order.

## Scale-up security checklist

Before any public/multi-user hosting, see `docs/PLAN.md` §10.7.
