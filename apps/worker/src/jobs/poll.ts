import { ingestFeed, isFeedDue } from "@distill/extract";
import { article, auditLog, db, feed, summary, userSettings } from "@distill/db";
import { generateSummary } from "@distill/providers";
import { eq, inArray } from "drizzle-orm";

// Auto-summarizes articles just inserted for a feed with auto_summarize on
// (PLAN §6.2), using the owning user's default_summary_provider. Runs in
// the worker so it never blocks an API request; failures are logged to
// audit_log and otherwise swallowed — a summary failing must not fail the
// poll that successfully ingested the article.
async function autoSummarizeInserted(f: typeof feed.$inferSelect, insertedArticleIds: string[]) {
  if (!f.autoSummarize || insertedArticleIds.length === 0) return;

  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, f.userId));
  const provider = settings?.defaultSummaryProvider;
  if (!provider) return;

  const rows = await db
    .select({ id: article.id, title: article.title, contentText: article.contentText })
    .from(article)
    .where(inArray(article.id, insertedArticleIds));

  for (const row of rows) {
    try {
      const result = await generateSummary({
        db,
        userId: f.userId,
        provider,
        articleTitle: row.title,
        articleText: row.contentText,
      });
      await db
        .insert(summary)
        .values({
          articleId: row.id,
          userId: f.userId,
          provider: result.provider,
          model: result.model,
          content: result.content,
          promptVersion: result.promptVersion,
        })
        .onConflictDoNothing({
          target: [summary.articleId, summary.userId, summary.provider, summary.model, summary.promptVersion],
        });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] auto-summarize failed for article ${row.id}: ${message}`);
      await db.insert(auditLog).values({
        userId: f.userId,
        action: "summary_error",
        targetType: "article",
        targetId: row.id,
        metadata: { provider, message, context: "auto_summarize" },
      });
    }
  }
}

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
      continue;
    }

    console.log(
      `[worker] polled feed ${f.id} (${f.title}): ${result.itemsFetched} items, ${result.articlesInserted} new`,
    );
    await autoSummarizeInserted(f, result.insertedArticleIds);
  }
}
