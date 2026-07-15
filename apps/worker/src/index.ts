import cron from "node-cron";
import { pollDueFeeds } from "./jobs/poll.js";
import { runPurge } from "./jobs/purge.js";

cron.schedule("* * * * *", async () => {
  try {
    await pollDueFeeds();
  } catch (err) {
    console.error("[worker] poll tick failed", err);
  }
});

// Once daily is plenty for a retention sweep measured in days.
cron.schedule("0 3 * * *", async () => {
  try {
    const purged = await runPurge();
    if (purged > 0) console.log(`[worker] purge: removed ${purged} article(s)`);
  } catch (err) {
    console.error("[worker] purge tick failed", err);
  }
});

console.log("Worker started.");
