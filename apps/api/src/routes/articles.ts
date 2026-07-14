import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { article, db, feed, feedTag } from "@distill/db";
import { listArticlesQuerySchema } from "@distill/shared";
import type { ArticleDetailDTO, ArticleListItemDTO, ArticlesPage } from "@distill/shared";
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

export const articlesRouter = new Hono<{ Variables: AuthVariables }>();
articlesRouter.use("*", requireAuth);

// published_at is frequently missing from feed items, so fall back to
// fetched_at (always set) for a stable, gap-free sort/cursor key. As a raw
// SQL expression (not a declared column), the driver returns it as a
// string rather than an auto-parsed Date, so encodeCursor normalizes it.
const sortKey = sql<string>`coalesce(${article.publishedAt}, ${article.fetchedAt})`;

function encodeCursor(sortTs: Date | string, id: string): string {
  const iso = sortTs instanceof Date ? sortTs.toISOString() : new Date(sortTs).toISOString();
  return Buffer.from(`${iso}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string): { ts: string; id: string } | null {
  try {
    const [ts, id] = Buffer.from(cursor, "base64url").toString("utf-8").split("|");
    if (!ts || !id) return null;
    return { ts, id };
  } catch {
    return null;
  }
}

articlesRouter.get("/", async (c) => {
  const userId = c.get("userId");
  const query = listArticlesQuerySchema.safeParse(c.req.query());
  if (!query.success) return c.json({ message: "Invalid query", issues: query.error.issues }, 400);
  const { feedId, tagId, cursor, limit } = query.data;

  const conditions = [eq(article.userId, userId)];
  if (feedId) conditions.push(eq(article.feedId, feedId));
  if (tagId) {
    conditions.push(
      inArray(
        article.feedId,
        db.select({ feedId: feedTag.feedId }).from(feedTag).where(eq(feedTag.tagId, tagId)),
      ),
    );
  }
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded) return c.json({ message: "Invalid cursor" }, 400);
    conditions.push(sql`(${sortKey}, ${article.id}) < (${decoded.ts}::timestamptz, ${decoded.id}::uuid)`);
  }

  const rows = await db
    .select({
      id: article.id,
      feedId: article.feedId,
      feedTitle: feed.title,
      title: article.title,
      author: article.author,
      publishedAt: article.publishedAt,
      excerpt: article.excerpt,
      leadImageUrl: article.leadImageUrl,
      wordCount: article.wordCount,
      extractionStatus: article.extractionStatus,
      sortTs: sortKey,
    })
    .from(article)
    .innerJoin(feed, eq(article.feedId, feed.id))
    .where(and(...conditions))
    .orderBy(sql`${sortKey} desc`, desc(article.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);

  const items: ArticleListItemDTO[] = page.map((r) => ({
    id: r.id,
    feedId: r.feedId,
    feedTitle: r.feedTitle,
    title: r.title,
    author: r.author,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    excerpt: r.excerpt,
    leadImageUrl: r.leadImageUrl,
    wordCount: r.wordCount,
    extractionStatus: r.extractionStatus,
  }));

  const response: ArticlesPage = {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.sortTs, last.id) : null,
  };
  return c.json(response);
});

articlesRouter.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const [row] = await db
    .select({
      id: article.id,
      feedId: article.feedId,
      feedTitle: feed.title,
      title: article.title,
      author: article.author,
      publishedAt: article.publishedAt,
      excerpt: article.excerpt,
      leadImageUrl: article.leadImageUrl,
      wordCount: article.wordCount,
      extractionStatus: article.extractionStatus,
      url: article.url,
      contentHtml: article.contentHtml,
    })
    .from(article)
    .innerJoin(feed, eq(article.feedId, feed.id))
    .where(and(eq(article.id, id), eq(article.userId, userId)));

  if (!row) return c.json({ message: "Not found" }, 404);

  const dto: ArticleDetailDTO = {
    ...row,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
  };
  return c.json(dto);
});
