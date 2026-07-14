# Aggregator — Product Development Plan

A self-hosted, cybersecurity-focused news reader. Pulls articles from RSS/Atom feeds and APIs, strips ads and inconsistent formatting, normalizes everything into one clean reading experience, and offers optional AI summaries, audio narration (TTS), and an RSVP speed-reader. Built to run as a single-user Docker deployment today, and to scale into a multi-user hosted service later without a rewrite.

> **How to use this file:** This is the build brief for Claude Code. Work through it in the phased order in **§13**. Do not skip the security requirements in **§10** — they are acceptance criteria, not suggestions. When a decision was already made, it is stated as a requirement; when something is left open, it is flagged **[DECIDE]**.

---

## 1. Goals & Non-Goals

### Goals
- Add a source by **pasting a URL**. The system auto-discovers the feed and auto-fills the source name/title.
- Support both **RSS/Atom feeds** and **API-based sources** (e.g. Hacker News) behind one common ingestion interface.
- **Extract and store the cleaned full-text** of each article locally — no ads, no third-party CSS, consistent typography.
- **Optional AI summaries** via user-supplied API keys: OpenAI, Anthropic, or local Ollama. On-demand with caching by default; per-feed auto-summarize toggle.
- **Optional audio narration (TTS)** via ElevenLabs (cloud, API key) or Piper (local, self-hosted, free). On-demand with caching, mirroring the summary provider model.
- A **clean, intuitive reader** with easy-on-the-eyes typography and selectable color schemes.
- An **RSVP speed-reader** (Blaze/Spritz-style): one word at a time, adjustable WPM, adjustable word/background color, screen dim, ORP pivot highlight.
- **Read-state management:** mark as read, auto-mark-as-read on view, and remove/clear articles the user isn't interested in.
- **Tag-based categorization** of feeds.
- **Auto-purge** to prevent DB bloat: read articles older than *X* days, unread older than *Y* days; starred articles kept forever.
- **Auth from day one** (single user now), with a schema and architecture that make multi-user hosting an additive change, not a rewrite.

### Non-Goals (v1)
- Multi-tenant hosting / billing / user self-registration (schema is prepared for it; UI/ops are not built).
- Mobile native apps (the SPA should be responsive, but no iOS/Android builds).
- Social features, sharing, comments.
- Browser extension.

---

## 2. Tech Stack (decided)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **Vite + React** SPA | TypeScript. No Next.js — clean API+SPA split. |
| UI | **Tailwind CSS + shadcn/ui** | Fast path to a clean, consistent, accessible UI. |
| Client data | **TanStack Query** | Caching, background refetch, optimistic updates for read-state. |
| API server | **Hono** (Node runtime) | Lightweight, fast, first-class Better Auth support. |
| Worker | Dedicated **Node process** | Feed polling, extraction, summarization, TTS generation. `node-cron` scheduler for v1. |
| ORM | **Drizzle ORM** | TS-native, typed migrations, Better Auth adapter. |
| Database | **PostgreSQL** | From day one, for scale readiness. |
| Auth | **Better Auth** | Email/password (+ session mgmt) now; social/SSO later. |
| Local AI (opt) | **Ollama** | Optional sidecar for local summaries. |
| Local TTS (opt) | **Piper** | Optional sidecar for local, zero-cost audio narration. |
| Runtime | **Node 22 LTS** | Same version across API + worker. |
| Packaging | **Docker Compose** | api + worker + postgres (+ optional ollama/piper). Reverse-proxy/TLS-ready. |

**Monorepo layout** (single language, shared types):

```
/aggregator
  /apps
    /web        # Vite + React SPA
    /api        # Hono API server
    /worker     # polling / extraction / summarization / tts
  /packages
    /db         # Drizzle schema + migrations (shared by api + worker)
    /shared     # shared TS types, zod schemas, constants
    /extract    # feed discovery + article extraction (shared by api + worker)
    /providers  # summary + tts provider interfaces & implementations
  docker-compose.yml
  .env.example
  README.md
```

Use **pnpm workspaces**. Shared code (DB schema, types, extraction, provider interfaces) lives in `/packages` so the API and worker never drift.

---

## 3. Architecture Overview

Three long-lived processes plus Postgres (and optional local AI/TTS sidecars):

1. **API server (Hono)** — serves the JSON API consumed by the SPA. Handles auth, feed CRUD, article read/clear/star actions, on-demand summary + TTS requests, and settings. Never blocks on long fetches; anything slow is delegated to the worker or run as a bounded async task.
2. **Worker (Node)** — on a schedule: for each active feed, fetch new items, extract + clean full text, store articles, and (if auto-summarize is on) generate summaries. Also runs the purge job and handles queued TTS synthesis. In v1 the scheduler is `node-cron` in-process; the design must allow swapping to **BullMQ + Redis** later without touching business logic.
3. **SPA (React)** — the reader UI. Talks only to the API. The RSVP speed-reader and the audio player are self-contained client modules.
4. **Postgres** — single source of truth (metadata + cache keys). Generated audio blobs live on a mounted volume, referenced by DB rows.

```
        ┌────────────┐        ┌──────────────┐
        │  React SPA │◄──────►│  Hono API    │
        └────────────┘  HTTP  └──────┬───────┘
                                     │ Drizzle
                               ┌─────▼──────┐
                               │  Postgres  │
                               └─────▲──────┘
                                     │ Drizzle
        ┌────────────────┐    ┌──────┴───────┐    ┌─────────────┐
        │ Feeds / APIs   │◄──►│   Worker     │◄──►│ Ollama /    │
        │ (RSS, HN, …)   │    │ (cron jobs)  │    │ Piper (opt) │
        └────────────────┘    └──────┬───────┘    └─────────────┘
                                     │ writes audio
                              ┌──────▼───────┐
                              │ audio volume │
                              └──────────────┘
```

**Key principle for scale:** the API and worker are stateless (all state in Postgres + the audio volume). Scaling later = run more API replicas behind a load balancer, move the scheduler to Redis/BullMQ, move audio to object storage, and point at managed Postgres. No code rewrite.

---

## 4. Data Model (Drizzle / Postgres)

All user-owned tables carry `user_id` from day one, even though there's one user in v1. This is the single most important decision for painless multi-user migration.

**`user`** *(managed by Better Auth — do not hand-roll)*
- `id`, `email`, `name`, `created_at`, plus Better Auth's `account` / `session` / `verification` tables.

**`feed`**
- `id` (uuid, pk)
- `user_id` (fk → user, indexed)
- `source_url` (text) — the URL the user pasted
- `feed_url` (text) — the resolved feed endpoint (may differ from source_url)
- `kind` (enum: `rss` | `atom` | `api_hackernews` | `readability`) — how to ingest
- `title` (text) — auto-filled from feed metadata, user-editable
- `site_url` (text), `favicon_url` (text, nullable)
- `auto_summarize` (bool, default false)
- `retention_read_days` (int, nullable — overrides global default)
- `retention_unread_days` (int, nullable)
- `poll_interval_minutes` (int, default 30)
- `last_polled_at` (timestamptz, nullable)
- `last_error` (text, nullable), `consecutive_failures` (int, default 0)
- `active` (bool, default true)
- `created_at`, `updated_at`

**`tag`**
- `id`, `user_id`, `name`, `color` (nullable) — unique on `(user_id, name)`.

**`feed_tag`** — join table `(feed_id, tag_id)`.

**`article`**
- `id` (uuid, pk)
- `feed_id` (fk → feed, indexed)
- `user_id` (denormalized fk, indexed — keeps per-user queries cheap)
- `guid` (text) — feed-provided id / HN item id; **unique on `(feed_id, guid)`** for dedup
- `url` (text) — canonical article URL
- `title` (text)
- `author` (text, nullable)
- `published_at` (timestamptz, nullable)
- `fetched_at` (timestamptz)
- `content_html` (text) — **sanitized** cleaned body (see §10)
- `content_text` (text) — plain text, used for RSVP + summarization + TTS
- `excerpt` (text, nullable)
- `lead_image_url` (text, nullable)
- `word_count` (int)
- `extraction_status` (enum: `ok` | `partial` | `failed`)
- `created_at`

**`article_state`** *(per-user read/clear/star — separated from `article` so multi-user shares nothing it shouldn't)*
- `id`, `user_id`, `article_id`
- `read_at` (timestamptz, nullable) — null = unread
- `starred` (bool, default false)
- `cleared_at` (timestamptz, nullable) — "removed from feed, not interested"
- unique on `(user_id, article_id)`

**`summary`**
- `id`, `article_id`, `user_id`
- `provider` (enum: `openai` | `anthropic` | `ollama`)
- `model` (text)
- `content` (text)
- `prompt_version` (text) — so cache can be invalidated when the prompt changes
- `created_at`
- unique on `(article_id, user_id, provider, model, prompt_version)` — this **is** the cache key.

**`tts_audio`** *(cached generated narration — audio bytes on the volume, metadata here)*
- `id`, `article_id`, `user_id`
- `provider` (enum: `elevenlabs` | `piper`)
- `voice` (text) — voice id / model name
- `format` (text) — `mp3` | `opus` | `wav`
- `storage_key` (text) — path/key on the audio volume (see §11)
- `duration_seconds` (numeric, nullable)
- `char_count` (int)
- `timings` (jsonb, nullable) — word/sentence timestamps when the provider supplies them (ElevenLabs)
- `settings_version` (text) — cache invalidation when voice/format/params change
- `created_at`
- unique on `(article_id, user_id, provider, voice, format, settings_version)` — the cache key.

**`user_settings`**
- `user_id` (pk)
- `default_retention_read_days` (int, default 30)
- `default_retention_unread_days` (int, default 90)
- `reader_theme` (jsonb) — font, size, color scheme
- `rsvp_prefs` (jsonb) — wpm, word color, bg dim, pivot color, punctuation pause
- `tts_prefs` (jsonb) — default provider, default voice, default playback speed, highlight-follow on/off
- `default_summary_provider` (enum, nullable)
- `default_tts_provider` (enum, nullable)

**`api_credential`** *(encrypted — see §10)*
- `id`, `user_id`
- `provider` (enum: `openai` | `anthropic` | `ollama` | `elevenlabs` | `piper`)
- `label` (text)
- `secret_encrypted` (bytea, nullable) — AEAD-encrypted key material; **null for keyless local providers** (Ollama, Piper)
- `base_url` (text, nullable) — for Ollama / Piper / custom endpoints
- `created_at`

**`audit_log`**
- `id`, `user_id` (nullable), `action`, `target_type`, `target_id`, `ip`, `user_agent`, `metadata` (jsonb), `created_at`.

> Add appropriate indexes: `(user_id, feed_id)` and `(user_id, read_at)` on state-adjacent queries; a partial index for unread; `(feed_id, published_at desc)` for feed timelines.

---

## 5. Ingestion & Extraction

A pluggable **Source Adapter** interface so RSS, Atom, and API sources share one contract:

```ts
interface SourceAdapter {
  kind: FeedKind;
  discover(url: string): Promise<DiscoveredFeed | null>; // used on "add feed"
  fetchItems(feed: Feed): Promise<RawItem[]>;            // used on poll
}
```

### 5.1 Add-feed flow (`POST /feeds`, body: `{ url }`)
1. Validate + **SSRF-check** the URL (§10) before any fetch.
2. **Feed discovery**, in order:
   - If the URL is already a feed (content-type or root element is `rss`/`feed`), use it directly.
   - Else fetch the HTML and look for `<link rel="alternate" type="application/rss+xml|atom+xml">`.
   - Else probe common paths (`/feed`, `/rss`, `/feed.xml`, `/atom.xml`, `/index.xml`).
   - Special-case **Hacker News**: if host is `news.ycombinator.com`, register `kind = api_hackernews`.
   - If nothing found, register `kind = readability` and treat the page itself as the item source.
3. Auto-fill `title`, `site_url`, `favicon_url` from feed/page metadata.
4. Return a preview to the client so the user confirms + adds tags before saving.

### 5.2 Adapters to implement
- **RSS / Atom** — use a maintained parser; normalize into `RawItem { guid, url, title, author, publishedAt, contentHtml? }`.
- **Hacker News (`api_hackernews`)** — HN aggregates outbound links. Pull the front-page / new items via the official Firebase API (`https://hacker-news.firebaseio.com/v0/…`) or the Algolia HN Search API. For each story, the **target article is the linked URL**, not the HN comments page — fetch and extract *that*. Store the HN discussion URL as secondary metadata. (Skip Ask/Show/text-only posts, or store their text directly.)
- **Readability fallback** — for sources with no feed: fetch the page, run readability-style main-content extraction.

### 5.3 Full-text extraction (all kinds)
Even when a feed provides `contentHtml`, many feeds ship truncated/ad-laden bodies. Always resolve the canonical article URL and run readability-grade extraction to get the clean main content. Then:
- Strip scripts, styles, tracking pixels, ad containers, share widgets.
- Rewrite/normalize headings, links (open external in new tab, `rel="noopener noreferrer"`), images (lazy, capped width).
- **Sanitize** the resulting HTML with an allowlist (§10) before storing in `content_html`.
- Derive `content_text` (for RSVP, summarizer, and TTS) and `word_count`.
- Set `extraction_status` (`ok` / `partial` / `failed`) so the UI can flag low-quality extractions and offer "open original."

### 5.4 Polling (worker)
- Every feed has `poll_interval_minutes`. Worker wakes on a short tick and polls feeds whose interval has elapsed.
- Dedup on `(feed_id, guid)`. Insert only new items.
- On fetch error: increment `consecutive_failures`, store `last_error`, apply exponential backoff; after N consecutive failures, mark feed degraded (still visible, flagged in UI).
- Respect `Last-Modified` / `ETag` conditional requests to save bandwidth.
- Set a descriptive `User-Agent` and honor reasonable rate limits / `Retry-After`.

### 5.5 Preseed test sources
Seed these for development and test extraction against them:
- **The Hacker News** — `https://thehackernews.com` (RSS)
- **Hacker News (YC)** — `https://news.ycombinator.com` (API adapter; fetch linked targets)
- **Krebs on Security** — `https://krebsonsecurity.com` (RSS)
- **Dark Reading** — `https://www.darkreading.com` (RSS)
- **BleepingComputer** — `https://www.bleepingcomputer.com` (RSS)

Write extraction tests that assert non-empty, ad-free `content_text` and a plausible `word_count` for a saved fixture from each.

---

## 6. AI Summarization

### 6.1 Providers (all three)
Pluggable `SummaryProvider` interface: `openai`, `anthropic`, `ollama`. Ollama takes a `base_url` and needs no key (self-hosted, zero token cost, no data leaves the network — good default for the homelab).

### 6.2 Behavior
- **Default: on-demand with caching.** When the user requests a summary, check the `summary` cache key (§4). Hit → return cached. Miss → generate, store, return.
- **Per-feed `auto_summarize` toggle:** when on, the worker generates the summary at ingest time using the user's `default_summary_provider`.
- **Long articles:** if `content_text` exceeds the model's comfortable context, chunk and **map-reduce** (summarize chunks, then summarize the summaries). Keep a single, versioned prompt (`prompt_version`) so cache invalidation is clean.
- Enforce timeouts and a token/size ceiling per request. Never block the API event loop — on-demand generation runs as a bounded async task with a spinner + polling or SSE to the client.
- Summaries are **additive**: the normalized full article is always available; the summary is an optional overlay.

### 6.3 Prompt
System prompt should produce a consistent structure: a 2–3 sentence TL;DR, then key points as short bullets, then (for security news) any named CVEs / affected products / IOCs when present. Keep output format identical across providers so the reader UI is uniform.

> **Note re: precis:** the user's prior tool (precis) silently produced no summaries and showed zero API activity despite seemingly-correct config. Avoid that failure mode by surfacing provider errors explicitly to the UI (auth failure, rate limit, timeout, empty response) and logging them to `audit_log` — never fail silently.

---

## 7. Text-to-Speech (Audio Narration)

Parallel to the RSVP reader: let the user **listen** to a normalized article. Two providers, mirroring the summarizer split — one cloud (key required), one local (self-hosted, free).

### 7.1 Providers (both)
Pluggable `TtsProvider` interface: `synthesize(text, voice, opts) → { audio, timings? }`.

- **ElevenLabs (`elevenlabs`)** — cloud, high-quality voices, **API key required**, per-character cost → caching matters. Supports streaming and word/character **timestamps** (used for highlight-follow). Store the key encrypted (§10).
- **Piper (`piper`)** — local self-hosted neural TTS, **no key**, addressed via `base_url` exactly like Ollama. Runs as an optional sidecar container. Zero cost, nothing leaves the network. (The user already runs Piper on Apple Silicon for another project — known-good fit; default local option.)

### 7.2 Behavior
- **Default: on-demand with caching**, same shape as summaries. Cache key is `(article_id, user_id, provider, voice, format, settings_version)` (§4). Hit → serve stored audio. Miss → synthesize, persist to the audio volume, write the `tts_audio` row, serve.
- Synthesize from `content_text` (already ad-free and normalized).
- **Long articles:** split by paragraph/sentence, synthesize sequentially, concatenate. **Stream the first chunk** to the player while later chunks generate so playback starts fast; finalize the cached file when all chunks complete.
- Store audio **on a filesystem volume, not in Postgres** (audio is large). The DB holds only the `storage_key` + metadata. Audio is deleted when its article is purged (§5.4 / retention).
- Capture **word/sentence timings** into `tts_audio.timings` when the provider returns them (ElevenLabs). Piper may not — degrade gracefully (plain playback, no highlight).
- Runs as a **bounded async task** (worker or API-dispatched), never blocking the event loop; client shows progress via polling or SSE.
- **Surface provider errors explicitly** (auth / quota / timeout / empty) to the UI and `audit_log` — same anti-silent-failure rule as summaries.

### 7.3 Playback UI (reader)
A self-contained audio-player module in the reader, sitting alongside the "Summarize" and "Speed-read" controls:
- **Listen** button → play / pause, scrubber, elapsed/total time.
- **Playback speed** (0.75×–2×) and **skip ±15s**.
- **Voice picker** populated from the provider's available voices (§7.4).
- **Highlight-follow (karaoke-style):** when `timings` exist, highlight the current sentence/word in the article body in sync with audio. Graceful fallback to plain playback when timings are absent. *(Nice-to-have — can ship after basic playback; see §14.)*
- Remembers **last playback position per article** and resumes.
- Defaults (provider, voice, speed, highlight on/off) persisted in `user_settings.tts_prefs`.

### 7.4 Voices
- `GET /tts/voices?provider=` lists available voices — ElevenLabs via its voices API (using the stored key), Piper from the installed voice models on the sidecar. Cache the list briefly.

---

## 8. Frontend / UX

### 8.1 Core screens
- **Feed list / sidebar:** all feeds grouped by tag, with unread counts. "All", "Unread", "Starred" smart views.
- **Article list:** for a selected feed/tag/view — title, source, time, excerpt, read/unread state. Bulk actions (mark all read, clear read).
- **Reader pane:** the normalized article. One typographic system, user-selectable theme (§8.3). Actions: mark read/unread, star, clear ("not interested"), summarize, **listen (TTS)**, open original, launch speed-reader.
- **Add-feed dialog:** paste URL → preview (auto-filled name, detected kind) → assign tags → save.
- **Settings:** API credentials (add/remove, never displayed after save), default summary provider, default TTS provider/voice, retention defaults, reader theme, RSVP defaults, TTS defaults.

### 8.2 Read-state behavior
- **Auto-mark-as-read on view:** when an article is opened/scrolled in the reader, mark read (debounced), with a user setting to disable.
- **Manual toggle** always available.
- **Clear / "not interested":** sets `cleared_at`; removes from default lists. A "Cleared" view allows undo.
- All read/clear/star actions are **optimistic** in TanStack Query, reconciled with the server; failures roll back with a toast.

### 8.3 Reader typography & themes
- Sensible measure (~66ch), generous line-height, a good reading font, adjustable size.
- Built-in themes: Light, Sepia, Dark, and a high-contrast option. Persist in `user_settings.reader_theme`.

### 8.4 RSVP speed-reader (self-contained module)
Blaze/Spritz-style, driven by `content_text`:
- Dims the surrounding screen; shows **one word at a time** centered.
- **Adjustable WPM** (live).
- **Adjustable word color + background** and **screen dim** level.
- **ORP pivot highlight:** compute the optimal recognition point per word and color that pivot letter (Spritz-style) so the eye stays fixed.
- **Pause/resume**, **rewind** a few words, restart.
- **Auto-pause / slowdown** on sentence-ending punctuation and unusually long words.
- Progress indicator (word i of N) and a way to jump back to normal reading at the current position.
- Persist prefs in `user_settings.rsvp_prefs`.

### 8.5 Audio player (self-contained module)
The listening counterpart to RSVP — see §7.3 for controls. Also a self-contained client module so it can evolve (highlight-follow, background playback) without touching the rest of the reader.

---

## 9. API Surface (Hono)

REST-ish JSON. All routes auth-gated except health + auth endpoints. All list endpoints scoped to the authenticated `user_id` server-side (never trust a client-supplied user id).

```
POST   /auth/*                      # delegated to Better Auth
GET    /health

GET    /feeds
POST   /feeds                       # { url } → discovery + preview or create
GET    /feeds/:id
PATCH  /feeds/:id                   # title, tags, auto_summarize, retention, active
DELETE /feeds/:id
POST   /feeds/:id/poll              # manual refresh

GET    /tags
POST   /tags
PATCH  /tags/:id
DELETE /tags/:id

GET    /articles                    # filters: feedId, tagId, view=unread|starred|cleared, cursor pagination
GET    /articles/:id                # full content_html
POST   /articles/:id/read           # { read: bool }
POST   /articles/:id/star           # { starred: bool }
POST   /articles/:id/clear          # { cleared: bool }
POST   /articles/read-all           # { feedId? | tagId? }

POST   /articles/:id/summary        # { provider?, model? } → cached or generated
GET    /articles/:id/summary        # cached only

POST   /articles/:id/tts            # { provider?, voice? } → cached or generated; returns audio URL + metadata
GET    /articles/:id/tts            # cached audio metadata (+ stream URL)
GET    /tts/audio/:id               # auth-scoped audio stream (NOT a public static path — see §10)
GET    /tts/voices                  # ?provider= → available voices

GET    /settings
PATCH  /settings

GET    /credentials                 # metadata only, never secrets
POST   /credentials                 # { provider, label, secret?, baseUrl? }
DELETE /credentials/:id
```

Use **cursor-based pagination** on `/articles` (keyed on `published_at, id`) — offset pagination won't scale.

---

## 10. Security Requirements (acceptance criteria)

This app fetches arbitrary user-supplied URLs and renders third-party HTML. Treat every external input as hostile. **v1 is single-user self-hosted, but every item below must be implemented now** — they are cheap up front and painful to retrofit. Items explicitly deferred are marked *(scale)*.

### 10.1 Rendering third-party content (highest risk)
- **HTML sanitization allowlist** on every extracted body before it is stored in `content_html`. Strip `<script>`, `<style>`, `<iframe>`, event handlers, `javascript:`/`data:` URLs, and any tag/attr not on the allowlist. Sanitize on **ingest** (store clean) and treat stored HTML as untrusted on render anyway.
- Strict **Content-Security-Policy** on the SPA: no inline scripts, no `unsafe-eval`, tight `default-src`. Article images from remote hosts loaded under a locked-down `img-src` (consider proxying/caching images to strip referer + tracking). Audio served from same-origin under `media-src 'self'`.
- External links: `target="_blank" rel="noopener noreferrer"`.

### 10.2 SSRF protection (URL fetcher)
- Before fetching **any** user-supplied URL (add-feed discovery, article fetch, and any user-supplied provider `base_url` such as Ollama/Piper): resolve DNS and **block private/link-local/loopback/metadata ranges** (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16 incl. `169.254.169.254`, `::1`, fc00::/7, etc.).
- Enforce **scheme allowlist** (`http`/`https` only), a redirect cap with re-validation of each hop's resolved IP, a response-size cap, and a fetch timeout.
- Run the fetcher so it cannot reach internal services even if a check is bypassed (network-segment the worker where possible). *(Note: the Ollama/Piper sidecars are a deliberate, configured exception — allowlist their known internal hostnames explicitly rather than opening the private-range block.)*

### 10.3 API key / secret storage
- User API keys (OpenAI, Anthropic, ElevenLabs) stored **encrypted at rest** with authenticated encryption (AEAD, e.g. libsodium/`XChaCha20-Poly1305` or AES-256-GCM). Encryption key from env/secret, **never** in the DB or repo.
- Secrets are **write-only from the client's perspective**: never returned by any endpoint after creation. `/credentials` returns metadata only.
- Keys used only server-side (worker/API) when calling providers. Keyless local providers (Ollama, Piper) store no secret.

### 10.4 Authentication & sessions (Better Auth)
- Email/password with strong hashing (Better Auth default), secure session cookies (`HttpOnly`, `Secure`, `SameSite=Lax/Strict`), sensible expiry + rotation.
- **CSRF protection** on all state-changing routes.
- Rate-limit auth endpoints (login/reset) to blunt brute force.
- *(scale)* social/SSO providers, email verification enforcement, optional 2FA.

### 10.5 Transport & headers
- Security headers: HSTS *(behind TLS)*, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, CSP (above).
- v1 self-host runs behind the user's own reverse proxy for TLS; document this. *(scale)* terminate TLS at the LB, force HTTPS.

### 10.6 Input validation & general hardening
- **Zod** validation on every request body/param (shared schemas in `/packages/shared`).
- Parameterized queries only (Drizzle) — no string-built SQL.
- Global **rate limiting** on the API; stricter limits on fetch / summarize / **TTS** routes (they cost money/CPU).
- **Audio serving is auth-scoped:** `GET /tts/audio/:id` verifies the requesting user owns the `tts_audio` row. Audio files are **never** exposed as a public static directory.
- **Audit logging** (`audit_log`) for auth events, credential changes, feed add/remove, and provider errors (summary + TTS).
- Dependency scanning in CI (`pnpm audit` / Dependabot). Pin base image digests.
- Non-root container user; minimal base image; drop capabilities; read-only FS where feasible (the audio volume is the writable exception).
- No secrets in the image or repo; `.env.example` documents required vars; real `.env` git-ignored.

### 10.7 Scale-up security checklist (documented now, built later)
Explicitly note these in the README as prerequisites before any public/multi-user hosting:
- Per-user data isolation verified end-to-end (every query scoped by `user_id`, **including audio files**; add row-level tests).
- Move secrets to a managed secret store (Vault / cloud KMS); rotate the encryption key with envelope encryption.
- Managed Postgres with encryption at rest, automated backups, least-privilege DB user.
- **Move audio to object storage** (S3/R2) with per-user prefixes and **signed, short-lived URLs** instead of same-origin streaming.
- Move scheduler/queue to Redis + BullMQ; isolate the worker's egress (SSRF blast radius grows with more users).
- Abuse controls: per-user feed / summary / **TTS-character** quotas, global fetch politeness, WAF/CDN in front. (ElevenLabs bills per character — a hard per-user TTS quota is important before multi-user.)
- Formal authz layer if roles appear (admin vs user).

---

## 11. Deployment (Docker)

`docker-compose.yml` with these services:
- **postgres** — volume-backed, healthcheck, least-privilege app user.
- **api** — Hono server, depends_on postgres healthy.
- **worker** — same image or sibling, runs the scheduler + summary/TTS jobs; depends_on postgres. Mounts the **audio volume** read/write.
- **web** — the built SPA served as static files (nginx or a tiny static server), or served by the API in v1 to keep it to fewer containers **[DECIDE: separate `web` container vs API serving static — default: separate container, cleaner for the CDN move later]**.
- **ollama** *(optional profile)* — local summaries.
- **piper** *(optional profile)* — local TTS. Enabled via a compose profile so users who only want ElevenLabs (or no TTS) don't run it.

Requirements:
- A named **audio volume** mounted into api (read) and worker (read/write); `AUDIO_STORAGE_PATH` env points at it.
- `.env.example` listing: `DATABASE_URL`, `ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `AUDIO_STORAGE_PATH`, optional `OLLAMA_BASE_URL` / `PIPER_BASE_URL`, app URLs, log level. Real values via `.env` (git-ignored) or Docker secrets.
- Migrations run on startup via a one-shot migrate step (Drizzle) before api/worker boot.
- Healthchecks on every service; sane restart policy.
- Document running behind a reverse proxy (Caddy/Traefik/nginx) for TLS.
- Non-root users, pinned image digests.

---

## 12. Testing

- **Extraction fixtures:** saved HTML from each of the five preseed sources; assert clean, ad-free `content_text` and a plausible `word_count`.
- **SSRF unit tests:** table of blocked/allowed hosts and IPs incl. redirect-to-internal and user-supplied provider `base_url`.
- **Sanitizer tests:** known XSS payloads must be neutralized.
- **Auth/authz tests:** every list/detail endpoint rejects cross-user access (seed two users; user A cannot read B's articles/feeds/credentials/**audio**).
- **Dedup test:** re-polling a feed inserts no duplicate `(feed_id, guid)`.
- **Summary cache test:** identical request hits cache; changing `prompt_version` misses.
- **TTS cache test:** identical request serves the stored file; changing `voice`/`settings_version` misses and regenerates.
- **TTS chunking test:** a long article splits, synthesizes, and concatenates to one playable file with correct total duration.
- **Audio authz test:** `GET /tts/audio/:id` refuses a user who doesn't own the row.
- **RSVP unit test:** ORP pivot index computed correctly across word lengths.

---

## 13. Phased Build Order

Build in this order; each phase should end runnable.

**Phase 0 — Scaffold**
- pnpm monorepo, TypeScript config, Docker Compose (postgres + empty api/worker/web), `.env.example`.
- Drizzle set up in `/packages/db`, first migration for the core schema (§4). Migration-on-startup wired.

**Phase 1 — Auth + shell**
- Better Auth wired into Hono; single-user email/password login. Secure cookies + CSRF.
- React SPA shell with login, protected routing, empty three-pane layout (sidebar / list / reader).

**Phase 2 — Feeds & ingestion (RSS/Atom)**
- Add-feed flow with SSRF check + feed discovery + auto-fill + preview.
- RSS/Atom adapter, extraction pipeline, sanitizer. Worker polling + dedup + backoff.
- Article list + reader pane render normalized content. Preseed the five sources.

**Phase 3 — Read-state & organization**
- Mark read / auto-mark-on-view / star / clear, optimistic updates.
- Tags + tag views; Unread / Starred / Cleared smart views. Bulk "mark all read".
- Purge job (retention defaults + per-feed overrides) — including deletion of orphaned audio files.

**Phase 4 — Hacker News API adapter**
- `api_hackernews` adapter: pull stories, fetch + extract the **linked target** article, handle Ask/Show/text posts.

**Phase 5 — AI summaries**
- Encrypted credential storage + settings UI. Provider interface (OpenAI, Anthropic, Ollama).
- On-demand + cache; per-feed auto-summarize; long-article map-reduce; explicit provider-error surfacing.

**Phase 6 — RSVP speed-reader**
- Self-contained reader module: one-word display, WPM, colors, dim, ORP pivot, pause/rewind, punctuation auto-pause, prefs persistence.

**Phase 7 — Text-to-Speech**
- `TtsProvider` interface (ElevenLabs + Piper). ElevenLabs credential via the existing encrypted store; Piper as optional sidecar with `base_url`.
- On-demand synthesis + caching to the audio volume; long-article chunk/concat with first-chunk streaming; auth-scoped audio serving; voice listing.
- Audio player UI (play/pause, scrubber, speed, skip, voice picker, resume). Highlight-follow when timings are available (can trail the rest of the phase).

**Phase 8 — Hardening & polish**
- CSP + security headers, rate limiting (incl. TTS/summary cost routes), audit logging, dependency scan in CI.
- Theme system, responsive layout, empty/error/loading states. README incl. the §10.7 scale-up checklist.

---

## 14. Open Decisions

- **[DECIDE]** `web` served by its own static container vs. by the API in v1. *Default: separate container.*
- **[DECIDE]** Default global retention values (starting point: read 30d, unread 90d).
- **[DECIDE]** Whether to proxy/cache remote article images through the app (better privacy + CSP, more storage) or hotlink under a strict `img-src`. *Lean: proxy, it fits the "no tracking / consistent" goal.*
- **[DECIDE]** Default on-demand summary provider when multiple credentials exist (suggest Ollama if configured, for zero cost).
- **[DECIDE]** Default TTS provider + audio format. *Lean: Piper + `mp3` if Piper is configured (zero cost, local); else ElevenLabs.*
- **[DECIDE]** Ship highlight-follow (karaoke sync) in v1, or defer to a follow-up? It depends on provider timings and adds reader-sync complexity. *Lean: basic playback in Phase 7, highlight-follow as a fast-follow.*
