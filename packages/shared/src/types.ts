// Mirrors the db `feed_kind` enum (packages/db/src/schema/feed.ts) without
// importing drizzle into consumers that only need the type.
export const FEED_KINDS = ["rss", "atom", "api_hackernews", "readability"] as const;
export type FeedKind = (typeof FEED_KINDS)[number];

export const EXTRACTION_STATUSES = ["ok", "partial", "failed"] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

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
  discussionUrl: string | null;
}

export interface ArticlesPage {
  items: ArticleListItemDTO[];
  nextCursor: string | null;
}
