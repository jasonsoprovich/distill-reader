import { ingestFeed, isFeedDue } from "@distill/extract";
import { db, feed } from "@distill/db";
import { eq } from "drizzle-orm";

// Wakes every minute and polls whichever active feeds are due, honoring
// each feed's poll_interval_minutes and exponential backoff after failures
// (PLAN §5.4).
export async function pollDueFeeds() {
  const feeds = await db.select().from(feed).where(eq(feed.active, true));
  const due = feeds.filter((f) => isFeedDue(f));

  for (const f of due) {
    const result = await ingestFeed(db, f);
    if (result.error) {
      console.error(`[worker] poll failed for feed ${f.id} (${f.title}): ${result.error}`);
    } else {
      console.log(
        `[worker] polled feed ${f.id} (${f.title}): ${result.itemsFetched} items, ${result.articlesInserted} new`,
      );
    }
  }
}
