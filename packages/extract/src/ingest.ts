import { eq } from "drizzle-orm";
import { article, feed, type db as DbInstance } from "@distill/db";
import { getAdapter } from "./adapters/index.js";
import { extractArticle } from "./extract-article.js";
import { sanitizeArticleHtml } from "./sanitize.js";

type Db = typeof DbInstance;
export type FeedRow = typeof feed.$inferSelect;

export interface IngestResult {
  feedId: string;
  itemsFetched: number;
  articlesInserted: number;
  error: string | null;
}

const BACKOFF_BASE_MINUTES = 5;
const MAX_BACKOFF_MINUTES = 24 * 60;

function backoffMinutes(consecutiveFailures: number): number {
  return Math.min(BACKOFF_BASE_MINUTES * 2 ** consecutiveFailures, MAX_BACKOFF_MINUTES);
}

/** Whether a feed's poll_interval_minutes has elapsed, honoring exponential backoff after failures. */
export function isFeedDue(
  f: Pick<FeedRow, "lastPolledAt" | "pollIntervalMinutes" | "consecutiveFailures">,
  now: Date = new Date(),
): boolean {
  if (!f.lastPolledAt) return true;
  const intervalMinutes =
    f.consecutiveFailures > 0
      ? Math.max(f.pollIntervalMinutes, backoffMinutes(f.consecutiveFailures))
      : f.pollIntervalMinutes;
  return now.getTime() >= f.lastPolledAt.getTime() + intervalMinutes * 60_000;
}

/**
 * Polls one feed (PLAN §5.4): fetch items via its adapter, extract +
 * sanitize each new item's full text, insert deduped on (feed_id, guid),
 * and update the feed's poll bookkeeping (last_polled_at / last_error /
 * consecutive_failures with exponential backoff). Shared by the worker's
 * scheduled tick and the API's manual `POST /feeds/:id/poll`.
 */
export async function ingestFeed(db: Db, feedRow: FeedRow): Promise<IngestResult> {
  const adapter = getAdapter(feedRow.kind);

  try {
    const items = await adapter.fetchItems({
      feedUrl: feedRow.feedUrl,
      sourceUrl: feedRow.sourceUrl,
      title: feedRow.title,
    });

    let inserted = 0;
    for (const item of items) {
      const extracted = await extractArticle(item.url);
      const contentHtml = extracted.contentHtml
        ? sanitizeArticleHtml(extracted.contentHtml, item.url)
        : "";

      const [row] = await db
        .insert(article)
        .values({
          feedId: feedRow.id,
          userId: feedRow.userId,
          guid: item.guid,
          url: item.url,
          title: item.title,
          author: item.author,
          publishedAt: item.publishedAt,
          contentHtml,
          contentText: extracted.contentText,
          excerpt: extracted.excerpt,
          leadImageUrl: extracted.leadImageUrl,
          wordCount: extracted.wordCount,
          extractionStatus: extracted.extractionStatus,
        })
        .onConflictDoNothing({ target: [article.feedId, article.guid] })
        .returning({ id: article.id });

      if (row) inserted += 1;
    }

    await db
      .update(feed)
      .set({ lastPolledAt: new Date(), lastError: null, consecutiveFailures: 0 })
      .where(eq(feed.id, feedRow.id));

    return { feedId: feedRow.id, itemsFetched: items.length, articlesInserted: inserted, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(feed)
      .set({
        lastPolledAt: new Date(),
        lastError: message,
        consecutiveFailures: feedRow.consecutiveFailures + 1,
      })
      .where(eq(feed.id, feedRow.id));

    return { feedId: feedRow.id, itemsFetched: 0, articlesInserted: 0, error: message };
  }
}
