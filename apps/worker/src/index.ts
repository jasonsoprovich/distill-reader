import { ingestFeed, isFeedDue } from "@distill/extract";
import { db, feed } from "@distill/db";
import { eq } from "drizzle-orm";
import cron from "node-cron";

// Wakes every minute and polls whichever active feeds are due, honoring
// each feed's poll_interval_minutes and exponential backoff after failures
// (PLAN §5.4). Purge job (Phase 3) adds a second scheduled job here.
async function pollDueFeeds() {
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

cron.schedule("* * * * *", async () => {
  try {
    await pollDueFeeds();
  } catch (err) {
    console.error("[worker] tick failed", err);
  }
});

console.log("Worker started.");
