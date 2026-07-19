// Mirrors the db `feed_kind` enum (packages/db/src/schema/feed.ts) without
// importing drizzle into consumers that only need the type.
export const FEED_KINDS = ["rss", "atom", "api_hackernews", "readability"] as const;
export type FeedKind = (typeof FEED_KINDS)[number];

export const EXTRACTION_STATUSES = ["ok", "partial", "failed"] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

// Mirrors the db `summary_provider` / `tts_provider` / `credential_provider`
// enums (packages/db/src/schema/ai.ts, settings.ts).
export const SUMMARY_PROVIDERS = ["openai", "anthropic", "ollama"] as const;
export type SummaryProviderKind = (typeof SUMMARY_PROVIDERS)[number];

export const TTS_PROVIDERS = ["elevenlabs", "piper", "openai", "kokoro"] as const;
export type TtsProviderKind = (typeof TTS_PROVIDERS)[number];

// Self-hosted-only providers eligible to run behind the local relay agent
// (apps/relay-agent) instead of a direct base_url — ElevenLabs/OpenAI are
// cloud APIs the server already reaches directly, so relaying them would add
// latency for no benefit.
export const RELAY_TTS_PROVIDERS = ["piper", "kokoro"] as const;
export type RelayTtsProviderKind = (typeof RELAY_TTS_PROVIDERS)[number];

// Options for the poll-interval pickers (AddFeedDialog, EditFeedDialog,
// Settings' default). Bounds match pollIntervalMinutes/defaultPollIntervalMinutes's
// z.number().min(5).max(1440) in schemas.ts (5 min to 24h).
export const POLL_INTERVAL_OPTIONS = [
  { minutes: 15, label: "Every 15 minutes" },
  { minutes: 30, label: "Every 30 minutes" },
  { minutes: 60, label: "Every hour" },
  { minutes: 120, label: "Every 2 hours" },
  { minutes: 240, label: "Every 4 hours" },
  { minutes: 360, label: "Every 6 hours" },
  { minutes: 720, label: "Every 12 hours" },
  { minutes: 1440, label: "Every 24 hours" },
] as const;

// ElevenLabs' selectable TTS models — Piper has no model concept, so its
// picker is voice-only. eleven_turbo_v2_5 is omitted: ElevenLabs' own docs
// mark it deprecated in favor of eleven_flash_v2_5, functionally equivalent
// with lower latency. Single source of truth for both the server (which
// falls back to the first entry as its default) and the picker UI.
export const ELEVENLABS_MODELS = [
  { id: "eleven_multilingual_v2", label: "Multilingual v2 — highest quality, long-form" },
  { id: "eleven_flash_v2_5", label: "Flash v2.5 — fastest, lowest cost" },
  { id: "eleven_v3", label: "v3 — most expressive" },
] as const;
export type ElevenLabsModelId = (typeof ELEVENLABS_MODELS)[number]["id"];

// OpenAI's selectable TTS models (https://platform.openai.com/docs/models —
// verified against the current /v1/audio/speech reference, not memorized).
// gpt-4o-mini-tts-2025-12-15 (a dated snapshot of the default row below) is
// omitted, same reasoning as ElevenLabs' deprecated model above.
export const OPENAI_TTS_MODELS = [
  { id: "gpt-4o-mini-tts", label: "GPT-4o mini TTS — most natural, lowest cost" },
  { id: "tts-1", label: "TTS-1 — fast, lower latency" },
  { id: "tts-1-hd", label: "TTS-1 HD — higher fidelity" },
] as const;
export type OpenAiTtsModelId = (typeof OPENAI_TTS_MODELS)[number]["id"];

// OpenAI's fixed set of built-in voice names — there's no list-voices
// endpoint for these (unlike ElevenLabs' per-account catalog), so this is
// the actual source of truth on both the server (packages/providers'
// listVoices) and, indirectly, whatever picker renders what it returns.
export const OPENAI_TTS_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "cedar",
  "coral",
  "echo",
  "fable",
  "marin",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
] as const;
export type OpenAiTtsVoiceId = (typeof OPENAI_TTS_VOICES)[number];

// What text gets narrated/speed-read: the full extracted article, or the
// cached AI summary. Distinct token/character cost and, per docs/COMPLIANCE.md,
// distinct copyright-exposure profile — kept as an explicit choice rather
// than always defaulting to the full article.
export const TTS_SOURCES = ["full", "summary"] as const;
export type TtsSource = (typeof TTS_SOURCES)[number];

export const CREDENTIAL_PROVIDERS = [...SUMMARY_PROVIDERS, ...TTS_PROVIDERS] as const;
export type CredentialProviderKind = (typeof CREDENTIAL_PROVIDERS)[number];

// --- Ingestion pipeline (packages/extract) -------------------------------

export interface DiscoveredFeed {
  sourceUrl: string;
  feedUrl: string;
  kind: FeedKind;
  title: string;
  siteUrl: string | null;
  faviconUrl: string | null;
}

export interface RawItem {
  guid: string;
  url: string;
  title: string;
  author: string | null;
  publishedAt: Date | null;
  contentHtml: string | null;
  // Secondary metadata (PLAN §5.2) — the HN comments page for
  // api_hackernews items; absent for every other feed kind.
  discussionUrl?: string | null;
}

export interface ExtractedArticle {
  contentHtml: string;
  contentText: string;
  excerpt: string | null;
  leadImageUrl: string | null;
  wordCount: number;
  extractionStatus: ExtractionStatus;
}

// --- API DTOs --------------------------------------------------------------

export interface TagDTO {
  id: string;
  name: string;
  color: string | null;
}

export interface FeedDTO {
  id: string;
  sourceUrl: string;
  feedUrl: string;
  kind: FeedKind;
  title: string;
  siteUrl: string | null;
  faviconUrl: string | null;
  autoSummarize: boolean;
  pollIntervalMinutes: number;
  lastPolledAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  active: boolean;
  tags: TagDTO[];
  unreadCount: number;
  createdAt: string;
}

export interface ArticleListItemDTO {
  id: string;
  feedId: string;
  feedTitle: string;
  title: string;
  author: string | null;
  publishedAt: string | null;
  excerpt: string | null;
  leadImageUrl: string | null;
  wordCount: number;
  extractionStatus: ExtractionStatus;
  readAt: string | null;
  starred: boolean;
  clearedAt: string | null;
}

export interface ArticleDetailDTO extends ArticleListItemDTO {
  url: string;
  contentHtml: string;
  // Plain text, used by client-only modules driven off the normalized body
  // (RSVP speed-reader, TTS synthesis) rather than the HTML.
  contentText: string;
  discussionUrl: string | null;
  // TTS audio player resume position (PLAN §7.3); null until playback starts.
  playbackPositionSeconds: number | null;
}

export interface ArticlesPage {
  items: ArticleListItemDTO[];
  nextCursor: string | null;
}

// Response shape of POST /feeds/:id/poll — mirrors packages/extract's
// IngestResult, trimmed to what the UI needs to report what happened.
export interface FeedPollResultDTO {
  articlesInserted: number;
  itemsFetched: number;
}

export interface SummaryDTO {
  provider: SummaryProviderKind;
  model: string;
  content: string;
  createdAt: string;
}

// Secrets are write-only (PLAN §10.3) — `hasSecret` tells the UI whether one
// is on file without ever exposing it after creation.
export interface CredentialDTO {
  id: string;
  provider: CredentialProviderKind;
  label: string;
  baseUrl: string | null;
  // True for a piper/kokoro credential routed through the local relay agent
  // instead of baseUrl (see RELAY_TTS_PROVIDERS / RelayAgentTokenDTO).
  viaRelay: boolean;
  hasSecret: boolean;
  createdAt: string;
}

// PLAN §8.4 — persisted RSVP speed-reader preferences. All fields optional
// so a partial patch (and an empty `{}` default row) both parse cleanly;
// the reader falls back to its own defaults for anything unset.
export interface RsvpPrefs {
  wpm?: number;
  wordColor?: string;
  backgroundColor?: string;
  pivotColor?: string;
  dimLevel?: number;
  punctuationPauseEnabled?: boolean;
  source?: TtsSource;
}

// PLAN §7.3 — persisted TTS audio-player preferences. All fields optional,
// same "partial patch + empty-row default" shape as RsvpPrefs. No `provider`
// field: voice/model selection now lives entirely in Settings, keyed off
// SettingsDTO.defaultTtsProvider as the single source of truth for which
// provider is active (previously this had its own per-listen override,
// back when the Listen popover had its own provider picker).
export interface TtsPrefs {
  voice?: string;
  // Only meaningful for providers with a model concept (ElevenLabs).
  model?: string;
  speed?: number;
  highlightFollowEnabled?: boolean;
  // Last source chosen from the read-aloud confirmation modal — used only
  // to pre-select that modal's default next time, not to skip asking.
  source?: TtsSource;
}

// PLAN §8.3 — built-in reader themes, persisted in user_settings.reader_theme.
export const READER_THEME_NAMES = [
  "light",
  "sepia",
  "dark",
  "high-contrast",
  "catppuccin-latte",
  "catppuccin-mocha",
  "nord",
  "ember",
] as const;
export type ReaderThemeName = (typeof READER_THEME_NAMES)[number];

// The original system stacks ("sans"/"serif"/"monospace" — kept as-is so an
// already-persisted choice doesn't silently break) plus a curated set of
// open-source, reading-optimized webfonts, self-hosted via @fontsource (not
// a Google Fonts CDN fetch — see apps/web/src/lib/reader-fonts.ts). The
// webfont IDs match their @fontsource package slug 1:1 so font-loading
// stays a straight lookup.
export const READER_FONT_NAMES = [
  "sans",
  "serif",
  "monospace",
  "literata",
  "lora",
  "merriweather",
  "eb-garamond",
  "source-serif-4",
  "pt-serif",
  "open-sans",
  "atkinson-hyperlegible",
  "ibm-plex-sans",
  "opendyslexic",
] as const;
export type ReaderFontName = (typeof READER_FONT_NAMES)[number];

export interface ReaderTheme {
  name?: ReaderThemeName;
  fontSize?: number;
  fontFamily?: ReaderFontName;
}

export interface SettingsDTO {
  defaultRetentionReadDays: number;
  defaultRetentionUnreadDays: number;
  defaultPollIntervalMinutes: number;
  readerTheme: ReaderTheme;
  rsvpPrefs: RsvpPrefs;
  ttsPrefs: TtsPrefs;
  defaultSummaryProvider: SummaryProviderKind | null;
  defaultTtsProvider: TtsProviderKind | null;
}

// Per-character alignment from providers that supply it (ElevenLabs); absent
// for providers that don't (Piper) — the player falls back to plain playback
// (PLAN §7.2/§7.3's "degrade gracefully" rule).
export interface TtsTimings {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}

export interface TtsAudioDTO {
  provider: TtsProviderKind;
  voice: string;
  // Only meaningful for providers with a model concept (ElevenLabs); null
  // for Piper.
  model: string | null;
  format: string;
  source: TtsSource;
  durationSeconds: number | null;
  charCount: number;
  timings: TtsTimings | null;
  createdAt: string;
  // Same-origin, auth-scoped stream URL (GET /tts/audio/:id) — never a
  // direct storage path (PLAN §10.6). Exception: a `data:` URI when the
  // server generated audio but couldn't persist it to AUDIO_STORAGE_PATH —
  // played inline once, not cached (apps/api/src/routes/articles.ts).
  url: string;
}

export interface TtsVoiceDTO {
  id: string;
  name: string;
  category?: string;
}

// Pairing tokens for the local TTS relay agent (apps/relay-agent) — the raw
// token is only ever returned once, from POST /relay/tokens
// (RelayTokenCreatedDTO below); every other read gets this secret-free shape,
// same write-only pattern as CredentialDTO.hasSecret.
export interface RelayAgentTokenDTO {
  id: string;
  label: string;
  lastSeenAt: string | null;
  createdAt: string;
}

// Response shape unique to POST /relay/tokens — the one place the raw
// pairing token is ever transmitted. The caller must show it to the user
// immediately; it cannot be retrieved again afterward.
export interface RelayTokenCreatedDTO extends RelayAgentTokenDTO {
  token: string;
}

// GET /relay/status — whether an agent for this user currently holds an open
// WebSocket to the API, so Settings can show live connection state rather
// than just "a token exists."
export interface RelayStatusDTO {
  connected: boolean;
  lastSeenAt: string | null;
}
