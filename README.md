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

### Optional: self-hosted summary/TTS providers (Ollama, Piper, Kokoro)

Ollama (AI summaries), Piper, and Kokoro (TTS narration) are self-hosted, so they're addressed by URL instead of an API key. Neither TTS sidecar starts with the default `docker compose up` — each is behind its own Compose profile:

```sh
docker compose --profile piper up -d piper
docker compose --profile kokoro up -d kokoro
```

Then, in the app's Settings → API credentials, add a credential for the provider with its base URL — `http://piper:5000` for the bundled Piper sidecar, `http://kokoro:8880` for the bundled Kokoro-FastAPI sidecar, or your own instance's address if you're running one elsewhere (same idea for Ollama, typically `http://ollama:11434`). See `.env.example`'s `PIPER_BASE_URL`/`KOKORO_BASE_URL`/`OLLAMA_BASE_URL`/`PIPER_VOICE` for the matching operator-side config. Kokoro ships every built-in voice baked into its image, so — unlike Piper — there's no separate voice-download env var to set.

### Optional: OAuth sign-in (GitHub, Google)

Distill is still single-user — OAuth is an alternative to setting a password, not a way to invite additional accounts. Whichever method (email/password or OAuth) creates the app's one account first is final; every sign-up attempt after that is rejected regardless of which flow it comes through.

To enable a provider, register an OAuth app with it using the callback URL `{BETTER_AUTH_URL}/auth/callback/github` (or `/google`) — `http://localhost:3001/auth/callback/github` for local dev — then set that provider's `*_CLIENT_ID`/`*_CLIENT_SECRET` pair in `.env`. A provider with no credentials configured simply doesn't show a button on the sign-in/setup pages. Apple sign-in isn't wired up — it needs a paid Apple Developer account and a more involved JWT-based client secret, unlike GitHub/Google's plain client ID + secret.

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
