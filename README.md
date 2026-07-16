# Distill

A cybersecurity-focused RSS/API news reader — self-hosted via Docker today, with cloud hosting planned as an additive option later (both stay supported). Browser-based on desktop and mobile (responsive, installable PWA); no native app is planned — see [`docs/PLAN.md`](docs/PLAN.md) for the full build brief (architecture, data model, security requirements, phased build order) and its §14 for the React Native evaluation behind that call.

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

Phase 8 (Hardening & polish) complete — see `docs/PLAN.md` §13 for the phased build order. Highlight-follow (karaoke sync, Phase 7) is deferred per §14's own lean; basic playback, caching, and resume are done.

## Scale-up security checklist

Everything below is a **prerequisite before any public/multi-user hosting** — none of it is built yet; it's deliberately deferred until self-hosted single-user use is solid (`docs/PLAN.md` §10.7):

- [ ] **Copyright/legal compliance review** — see [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) for product-planning research (not legal advice) on RSS/full-text extraction, AI summaries, and TTS narration. Register a DMCA §512 designated agent and takedown policy, and get actual legal counsel, before charging money or opening multi-user hosting.
- [ ] Per-user data isolation verified end-to-end (every query scoped by `user_id`, **including audio files**; add row-level tests).
- [ ] Move secrets to a managed secret store (Vault / cloud KMS); rotate the encryption key with envelope encryption.
- [ ] Managed Postgres with encryption at rest, automated backups, least-privilege DB user.
- [ ] **Move audio to object storage** (S3/R2) with per-user prefixes and **signed, short-lived URLs** instead of same-origin streaming.
- [ ] Move scheduler/queue to Redis + BullMQ; isolate the worker's egress (SSRF blast radius grows with more users).
- [ ] Abuse controls: per-user feed / summary / **TTS-character** quotas, global fetch politeness, WAF/CDN in front. (ElevenLabs bills per character — a hard per-user TTS quota is important before multi-user. The current rate limiter is a per-IP/per-user *request-count* limit, in-memory, single-process — fine for self-hosted v1, not a substitute for this.)
- [ ] Formal authz layer if roles appear (admin vs user).
