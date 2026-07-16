import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { article, articleState, auditLog, db, feed, feedTag, tag } from "@distill/db";
import { discoverFeed, ingestFeed, signImageUrl } from "@distill/extract";
import { createFeedSchema, patchFeedSchema, previewFeedSchema } from "@distill/shared";
import type { FeedDTO, TagDTO } from "@distill/shared";
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { costlyRouteRateLimit } from "../middleware/rate-limit.js";

export const feedsRouter = new Hono<{ Variables: AuthVariables }>();
feedsRouter.use("*", requireAuth);

async function tagsByFeedId(userId: string): Promise<Map<string, TagDTO[]>> {
  const rows = await db
    .select({ feedId: feedTag.feedId, id: tag.id, name: tag.name, color: tag.color })
    .from(feedTag)
    .innerJoin(tag, eq(feedTag.tagId, tag.id))
    .innerJoin(feed, eq(feedTag.feedId, feed.id))
    .where(eq(feed.userId, userId));

  const map = new Map<string, TagDTO[]>();
  for (const row of rows) {
    const list = map.get(row.feedId) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    map.set(row.feedId, list);
  }
  return map;
}

// An article counts as unread until it has an article_state row with
// read_at set — no row at all (the default for every newly ingested
// article) counts as unread too. Removed ("cleared") articles are
// excluded so they don't inflate the badge after being dismissed.
async function unreadCountsByFeedId(userId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ feedId: article.feedId, count: sql<number>`count(*)::int` })
    .from(article)
    .leftJoin(articleState, and(eq(articleState.articleId, article.id), eq(articleState.userId, userId)))
    .where(and(eq(article.userId, userId), isNull(articleState.readAt), isNull(articleState.clearedAt)))
    .groupBy(article.feedId);

  return new Map(rows.map((r) => [r.feedId, r.count]));
}

// feed.faviconUrl is stored as the raw, original URL (so it isn't baked to
// today's API origin forever) — sign it into a proxied, CSP-safe URL only
// at the response boundary, matching how article body images are proxied.
function toDTO(row: typeof feed.$inferSelect, tags: TagDTO[], unreadCount: number): FeedDTO {
  return {
    id: row.id,
    sourceUrl: row.sourceUrl,
    feedUrl: row.feedUrl,
    kind: row.kind,
    title: row.title,
    siteUrl: row.siteUrl,
    faviconUrl: row.faviconUrl ? signImageUrl(row.faviconUrl) : null,
    autoSummarize: row.autoSummarize,
    pollIntervalMinutes: row.pollIntervalMinutes,
    lastPolledAt: row.lastPolledAt ? row.lastPolledAt.toISOString() : null,
    lastError: row.lastError,
    consecutiveFailures: row.consecutiveFailures,
    active: row.active,
    tags,
    unreadCount,
    createdAt: row.createdAt.toISOString(),
  };
}

feedsRouter.get("/", async (c) => {
  const userId = c.get("userId");
  const [rows, tagsMap, unreadMap] = await Promise.all([
    db.select().from(feed).where(eq(feed.userId, userId)).orderBy(feed.title),
    tagsByFeedId(userId),
    unreadCountsByFeedId(userId),
  ]);
  return c.json(rows.map((row) => toDTO(row, tagsMap.get(row.id) ?? [], unreadMap.get(row.id) ?? 0)));
});

// Discovers a feed without persisting anything, so the add-feed dialog can
// show a preview (auto-filled title/kind/favicon) before the user confirms.
feedsRouter.post("/preview", costlyRouteRateLimit, async (c) => {
  const body = previewFeedSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ message: "Invalid request", issues: body.error.issues }, 400);

  let discovered: Awaited<ReturnType<typeof discoverFeed>>;
  try {
    discovered = await discoverFeed(body.data.url);
  } catch (err) {
    return c.json({ message: err instanceof Error ? err.message : "Discovery failed" }, 422);
  }
  if (!discovered) return c.json({ message: "Could not find a feed at that URL" }, 422);
  return c.json(discovered);
});

feedsRouter.post("/", async (c) => {
  const userId = c.get("userId");
  const body = createFeedSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ message: "Invalid request", issues: body.error.issues }, 400);

  const { tagIds, ...feedFields } = body.data;
  const [row] = await db
    .insert(feed)
    .values({ ...feedFields, userId })
    .returning();

  if (tagIds?.length) {
    const ownedTags = await db
      .select({ id: tag.id })
      .from(tag)
      .where(and(eq(tag.userId, userId), inArray(tag.id, tagIds)));
    if (ownedTags.length) {
      await db.insert(feedTag).values(ownedTags.map((t) => ({ feedId: row.id, tagId: t.id })));
    }
  }

  const tagsMap = await tagsByFeedId(userId);

  // PLAN §10.6 — audit log for feed add.
  await db.insert(auditLog).values({
    userId,
    action: "feed_create",
    targetType: "feed",
    targetId: row.id,
    metadata: { sourceUrl: row.sourceUrl, kind: row.kind },
  });

  return c.json(toDTO(row, tagsMap.get(row.id) ?? [], 0), 201);
});

feedsRouter.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const [row] = await db.select().from(feed).where(and(eq(feed.id, id), eq(feed.userId, userId)));
  if (!row) return c.json({ message: "Not found" }, 404);

  const [tagsMap, unreadMap] = await Promise.all([tagsByFeedId(userId), unreadCountsByFeedId(userId)]);
  return c.json(toDTO(row, tagsMap.get(row.id) ?? [], unreadMap.get(row.id) ?? 0));
});

feedsRouter.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = patchFeedSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ message: "Invalid request", issues: body.error.issues }, 400);

  const [existing] = await db
    .select({ id: feed.id })
    .from(feed)
    .where(and(eq(feed.id, id), eq(feed.userId, userId)));
  if (!existing) return c.json({ message: "Not found" }, 404);

  const { tagIds, ...patchFields } = body.data;
  const [row] = Object.keys(patchFields).length
    ? await db.update(feed).set(patchFields).where(eq(feed.id, id)).returning()
    : await db.select().from(feed).where(eq(feed.id, id));

  if (tagIds) {
    await db.delete(feedTag).where(eq(feedTag.feedId, id));
    if (tagIds.length) {
      const ownedTags = await db
        .select({ id: tag.id })
        .from(tag)
        .where(and(eq(tag.userId, userId), inArray(tag.id, tagIds)));
      if (ownedTags.length) {
        await db.insert(feedTag).values(ownedTags.map((t) => ({ feedId: id, tagId: t.id })));
      }
    }
  }

  const [tagsMap, unreadMap] = await Promise.all([tagsByFeedId(userId), unreadCountsByFeedId(userId)]);
  return c.json(toDTO(row, tagsMap.get(row.id) ?? [], unreadMap.get(row.id) ?? 0));
});

feedsRouter.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const result = await db
    .delete(feed)
    .where(and(eq(feed.id, id), eq(feed.userId, userId)))
    .returning({ id: feed.id, sourceUrl: feed.sourceUrl, title: feed.title });
  if (!result.length) return c.json({ message: "Not found" }, 404);

  // PLAN §10.6 — audit log for feed removal.
  await db.insert(auditLog).values({
    userId,
    action: "feed_delete",
    targetType: "feed",
    targetId: result[0].id,
    metadata: { sourceUrl: result[0].sourceUrl, title: result[0].title },
  });

  return c.body(null, 204);
});

feedsRouter.post("/:id/poll", costlyRouteRateLimit, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const [row] = await db.select().from(feed).where(and(eq(feed.id, id), eq(feed.userId, userId)));
  if (!row) return c.json({ message: "Not found" }, 404);

  const result = await ingestFeed(db, row);
  return c.json(result);
});
