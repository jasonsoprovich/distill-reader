import cron from "node-cron";
import { db } from "@distill/db";
import { sql } from "drizzle-orm";

// Wakes every minute; Phase 2 adds the feed-poll tick (poll feeds whose
// poll_interval_minutes has elapsed), Phase 3 adds the purge job.
cron.schedule("* * * * *", async () => {
  await db.execute(sql`select 1`);
  console.log(`[worker] tick ${new Date().toISOString()}`);
});

console.log("Worker started.");
