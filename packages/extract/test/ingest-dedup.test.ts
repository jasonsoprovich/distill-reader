import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

// Requires a live Postgres via DATABASE_URL (docker compose up -d postgres +
// pnpm db:migrate) — skipped otherwise so `pnpm --filter @distill/extract
// test` still runs the rest of the suite without a database. All @distill/db
// imports are dynamic so the module (which throws without DATABASE_URL) is
// never touched when this suite is skipped.
describe.skipIf(!process.env.DATABASE_URL)("article (feed_id, guid) uniqueness", () => {
  it("re-polling a feed does not insert a duplicate article — the constraint ingestFeed's dedup relies on", async () => {
    const { db, feed, article, user } = await import("@distill/db");
    const { eq } = await import("drizzle-orm");

    const userId = `test-user-${randomUUID()}`;
    const feedId = randomUUID();
    const guid = `guid-${randomUUID()}`;

    await db.insert(user).values({
      id: userId,
      name: "Dedup Test User",
      email: `${userId}@example.test`,
    });

    await db.insert(feed).values({
      id: feedId,
      userId,
      sourceUrl: "https://example.com/",
      feedUrl: "https://example.com/feed.xml",
      kind: "rss",
      title: "Dedup Test Feed",
    });

    try {
      const insertOnce = () =>
        db
          .insert(article)
          .values({
            feedId,
            userId,
            guid,
            url: "https://example.com/dedup-test-article",
            title: "Dedup test article",
            contentHtml: "<p>hi</p>",
            contentText: "hi",
            extractionStatus: "ok",
          })
          .onConflictDoNothing({ target: [article.feedId, article.guid] })
          .returning({ id: article.id });

      const first = await insertOnce();
      const second = await insertOnce();

      expect(first).toHaveLength(1);
      expect(second).toHaveLength(0);

      const rows = await db.select().from(article).where(eq(article.feedId, feedId));
      expect(rows).toHaveLength(1);
    } finally {
      await db.delete(feed).where(eq(feed.id, feedId));
      await db.delete(user).where(eq(user.id, userId));
    }
  });
});
