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
  // Ids of the articles actually inserted this poll (excludes dedup skips),
  // so callers can act on just the new ones — e.g. the worker's
  // auto-summarize-at-ingest hook (PLAN §6.2).
  insertedArticleIds: string[];
  error: string | null;
}

const BACKOFF_BASE_MINUTES = 5;
const MAX_BACKOFF_MINUTES = 24 * 60;

// Applies to every poll (first ingest and every subsequent tick alike —
// there's no separate "backfill" path). Without this, an adapter with no
// cap of its own (rss.ts ingests every item the feed returns) can dump a
// feed's entire history into a user's unread list the moment it's added,
// and re-extract just as many articles on every later poll if the source
// feed itself always lists that many items. The Hacker News adapter has
// its own tighter MAX_STORIES cap for a different reason (bounding
// per-tick fetch/SSRF-check volume) and stays under this ceiling anyway.
const MAX_ITEMS_PER_POLL = 50;

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
    const fetchedItems = await adapter.fetchItems({
      feedUrl: feedRow.feedUrl,
      sourceUrl: feedRow.sourceUrl,
      title: feedRow.title,
    });
    const items = fetchedItems.slice(0, MAX_ITEMS_PER_POLL);

    let inserted = 0;
    const insertedArticleIds: string[] = [];
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
          discussionUrl: item.discussionUrl ?? null,
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

      if (row) {
        inserted += 1;
        insertedArticleIds.push(row.id);
      }
    }

    await db
      .update(feed)
      .set({ lastPolledAt: new Date(), lastError: null, consecutiveFailures: 0 })
      .where(eq(feed.id, feedRow.id));

    return {
      feedId: feedRow.id,
      itemsFetched: items.length,
      articlesInserted: inserted,
      insertedArticleIds,
      error: null,
    };
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

    return { feedId: feedRow.id, itemsFetched: 0, articlesInserted: 0, insertedArticleIds: [], error: message };
  }
}
