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

export const TTS_PROVIDERS = ["elevenlabs", "piper"] as const;
export type TtsProviderKind = (typeof TTS_PROVIDERS)[number];

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
// same "partial patch + empty-row default" shape as RsvpPrefs.
export interface TtsPrefs {
  provider?: TtsProviderKind;
  voice?: string;
  speed?: number;
  highlightFollowEnabled?: boolean;
  source?: TtsSource;
}

// PLAN §8.3 — built-in reader themes, persisted in user_settings.reader_theme.
export const READER_THEME_NAMES = ["light", "sepia", "dark", "high-contrast"] as const;
export type ReaderThemeName = (typeof READER_THEME_NAMES)[number];

// A small set of reader-friendly font families, in the spirit of an
// e-reader's font picker — system font stacks only, no webfont loading.
export const READER_FONT_NAMES = ["sans", "serif", "monospace"] as const;
export type ReaderFontName = (typeof READER_FONT_NAMES)[number];

export interface ReaderTheme {
  name?: ReaderThemeName;
  fontSize?: number;
  fontFamily?: ReaderFontName;
}

export interface SettingsDTO {
  defaultRetentionReadDays: number;
  defaultRetentionUnreadDays: number;
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
  format: string;
  source: TtsSource;
  durationSeconds: number | null;
  charCount: number;
  timings: TtsTimings | null;
  createdAt: string;
  // Same-origin, auth-scoped stream URL (GET /tts/audio/:id) — never a
  // direct storage path (PLAN §10.6).
  url: string;
}

export interface TtsVoiceDTO {
  id: string;
  name: string;
}
