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
  // (RSVP speed-reader today; TTS synthesis later) rather than the HTML.
  contentText: string;
  discussionUrl: string | null;
}

export interface ArticlesPage {
  items: ArticleListItemDTO[];
  nextCursor: string | null;
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
}

export interface SettingsDTO {
  defaultRetentionReadDays: number;
  defaultRetentionUnreadDays: number;
  readerTheme: Record<string, unknown>;
  rsvpPrefs: RsvpPrefs;
  ttsPrefs: Record<string, unknown>;
  defaultSummaryProvider: SummaryProviderKind | null;
  defaultTtsProvider: TtsProviderKind | null;
}
