import { and, eq } from "drizzle-orm";
import { db, feed } from "@distill/db";

// Sentinel sourceUrl for the single hidden per-user feed that "Save article
// from URL" (POST /articles/from-url) attaches its articles to. Never a
// real fetchable URL — the "distill:" scheme guarantees no collision with
// an actual http(s) feed/site — so GET /feeds can filter this row out of
// the Feeds section by exact match, keeping saved articles out of the feed
// list while still showing up in the article views (All/Unread/etc, which
// aren't feed-scoped).
export const READING_LIST_SOURCE_URL = "distill:reading-list";
const READING_LIST_TITLE = "Saved articles";

export async function findOrCreateReadingListFeed(userId: string) {
  const [existing] = await db
    .select()
    .from(feed)
    .where(and(eq(feed.userId, userId), eq(feed.sourceUrl, READING_LIST_SOURCE_URL)));
  if (existing) return existing;

  const [created] = await db
    .insert(feed)
    .values({
      userId,
      sourceUrl: READING_LIST_SOURCE_URL,
      feedUrl: READING_LIST_SOURCE_URL,
      kind: "readability",
      title: READING_LIST_TITLE,
      siteUrl: null,
      faviconUrl: null,
      // Never picked up by the worker's poll tick (apps/worker/src/jobs/poll.ts
      // only selects active=true feeds) — each saved article is fetched once,
      // on demand, not re-polled the way a real feed's items are.
      active: false,
    })
    .returning();
  return created;
}
