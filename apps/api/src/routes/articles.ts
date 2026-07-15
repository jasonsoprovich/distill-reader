import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { article, articleState, auditLog, db, feed, feedTag, summary, userSettings } from "@distill/db";
import { generateSummary, resolveModel, SUMMARY_PROMPT_VERSION, SummaryProviderError } from "@distill/providers";
import {
  clearArticleSchema,
  listArticlesQuerySchema,
  markReadSchema,
  readAllSchema,
  requestSummarySchema,
  starArticleSchema,
} from "@distill/shared";
import type { ArticleDetailDTO, ArticleListItemDTO, ArticlesPage, SummaryDTO, SummaryProviderKind } from "@distill/shared";
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

// Every list/detail read joins article_state (scoped to the requesting
// user) so read/star/clear status travels with the article — no row at all
// is the default state (unread, unstarred, not cleared) for a freshly
// ingested article.
function articleStateJoin(userId: string) {
  return and(eq(articleState.articleId, article.id), eq(articleState.userId, userId));
}

// Sets an article_state row's read/star/clear fields, upserting on the
// (userId, articleId) unique key. Returns null if the article doesn't
// exist or isn't owned by this user, so callers can 404.
async function upsertArticleState(
  userId: string,
  articleId: string,
  patch: Partial<{ readAt: Date | null; starred: boolean; clearedAt: Date | null }>,
) {
  const [owned] = await db
    .select({ id: article.id })
    .from(article)
    .where(and(eq(article.id, articleId), eq(article.userId, userId)));
  if (!owned) return null;

  const [row] = await db
    .insert(articleState)
    .values({ userId, articleId, ...patch })
    .onConflictDoUpdate({ target: [articleState.userId, articleState.articleId], set: patch })
    .returning();
  return row;
}

articlesRouter.get("/", async (c) => {
  const userId = c.get("userId");
  const query = listArticlesQuerySchema.safeParse(c.req.query());
  if (!query.success) return c.json({ message: "Invalid query", issues: query.error.issues }, 400);
  const { feedId, tagId, view, cursor, limit } = query.data;

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
  if (view === "unread") {
    conditions.push(isNull(articleState.readAt), isNull(articleState.clearedAt));
  } else if (view === "starred") {
    conditions.push(eq(articleState.starred, true));
  } else if (view === "cleared") {
    conditions.push(isNotNull(articleState.clearedAt));
  } else {
    // Default view excludes cleared ("not interested") articles.
    conditions.push(isNull(articleState.clearedAt));
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
      readAt: articleState.readAt,
      starred: articleState.starred,
      clearedAt: articleState.clearedAt,
      sortTs: sortKey,
    })
    .from(article)
    .innerJoin(feed, eq(article.feedId, feed.id))
    .leftJoin(articleState, articleStateJoin(userId))
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
    readAt: r.readAt ? r.readAt.toISOString() : null,
    starred: r.starred ?? false,
    clearedAt: r.clearedAt ? r.clearedAt.toISOString() : null,
  }));

  const response: ArticlesPage = {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.sortTs, last.id) : null,
  };
  return c.json(response);
});

// Bulk mark-as-read, scoped to the same feedId/tagId filters as the list
// endpoint (omit both to mark every unread article read). Cleared articles
// are left alone — they're already out of the default reading flow.
articlesRouter.post("/read-all", async (c) => {
  const userId = c.get("userId");
  const body = readAllSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ message: "Invalid request", issues: body.error.issues }, 400);
  const { feedId, tagId } = body.data;

  const conditions = [eq(article.userId, userId), isNull(articleState.readAt), isNull(articleState.clearedAt)];
  if (feedId) conditions.push(eq(article.feedId, feedId));
  if (tagId) {
    conditions.push(
      inArray(
        article.feedId,
        db.select({ feedId: feedTag.feedId }).from(feedTag).where(eq(feedTag.tagId, tagId)),
      ),
    );
  }

  const targets = await db
    .select({ id: article.id })
    .from(article)
    .leftJoin(articleState, articleStateJoin(userId))
    .where(and(...conditions));
  if (!targets.length) return c.json({ updated: 0 });

  const now = new Date();
  await db
    .insert(articleState)
    .values(targets.map((t) => ({ userId, articleId: t.id, readAt: now })))
    .onConflictDoUpdate({ target: [articleState.userId, articleState.articleId], set: { readAt: now } });

  return c.json({ updated: targets.length });
});

articlesRouter.post("/:id/read", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = markReadSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ message: "Invalid request", issues: body.error.issues }, 400);

  const row = await upsertArticleState(userId, id, { readAt: body.data.read ? new Date() : null });
  if (!row) return c.json({ message: "Not found" }, 404);
  return c.json({ readAt: row.readAt ? row.readAt.toISOString() : null });
});

articlesRouter.post("/:id/star", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = starArticleSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ message: "Invalid request", issues: body.error.issues }, 400);

  const row = await upsertArticleState(userId, id, { starred: body.data.starred });
  if (!row) return c.json({ message: "Not found" }, 404);
  return c.json({ starred: row.starred });
});

articlesRouter.post("/:id/clear", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = clearArticleSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ message: "Invalid request", issues: body.error.issues }, 400);

  const row = await upsertArticleState(userId, id, { clearedAt: body.data.cleared ? new Date() : null });
  if (!row) return c.json({ message: "Not found" }, 404);
  return c.json({ clearedAt: row.clearedAt ? row.clearedAt.toISOString() : null });
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
      discussionUrl: article.discussionUrl,
      readAt: articleState.readAt,
      starred: articleState.starred,
      clearedAt: articleState.clearedAt,
    })
    .from(article)
    .innerJoin(feed, eq(article.feedId, feed.id))
    .leftJoin(articleState, articleStateJoin(userId))
    .where(and(eq(article.id, id), eq(article.userId, userId)));

  if (!row) return c.json({ message: "Not found" }, 404);

  const dto: ArticleDetailDTO = {
    ...row,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    starred: row.starred ?? false,
    clearedAt: row.clearedAt ? row.clearedAt.toISOString() : null,
  };
  return c.json(dto);
});

function toSummaryDTO(row: typeof summary.$inferSelect): SummaryDTO {
  return { provider: row.provider, model: row.model, content: row.content, createdAt: row.createdAt.toISOString() };
}

// Maps a provider failure to a client-actionable status — never a bare 500
// (PLAN §6.3's precis footnote: surface provider errors explicitly).
function statusForSummaryError(code: SummaryProviderError["code"]): 401 | 429 | 502 | 504 {
  switch (code) {
    case "auth":
      return 401;
    case "rate_limit":
      return 429;
    case "timeout":
      return 504;
    default:
      return 502;
  }
}

async function ownedArticleForSummary(userId: string, id: string) {
  const [row] = await db
    .select({ id: article.id, title: article.title, contentText: article.contentText })
    .from(article)
    .where(and(eq(article.id, id), eq(article.userId, userId)));
  return row ?? null;
}

async function logSummaryError(userId: string, articleId: string, provider: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const code = err instanceof SummaryProviderError ? err.code : "unknown";
  await db.insert(auditLog).values({
    userId,
    action: "summary_error",
    targetType: "article",
    targetId: articleId,
    metadata: { provider, code, message },
  });
}

// Cached only — never triggers generation, so it's safe to call on every
// article view without incurring provider cost.
articlesRouter.get("/:id/summary", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const query = requestSummarySchema.safeParse(c.req.query());
  if (!query.success) return c.json({ message: "Invalid query", issues: query.error.issues }, 400);

  const owned = await ownedArticleForSummary(userId, id);
  if (!owned) return c.json({ message: "Not found" }, 404);

  const conditions = [
    eq(summary.articleId, id),
    eq(summary.userId, userId),
    eq(summary.promptVersion, SUMMARY_PROMPT_VERSION),
  ];
  if (query.data.provider) conditions.push(eq(summary.provider, query.data.provider));
  if (query.data.model) conditions.push(eq(summary.model, query.data.model));

  const [row] = await db.select().from(summary).where(and(...conditions)).orderBy(desc(summary.createdAt)).limit(1);
  if (!row) return c.json({ message: "No cached summary" }, 404);
  return c.json(toSummaryDTO(row));
});

// On-demand: cache hit returns immediately; a miss generates synchronously
// under each provider call's own bounded timeout (PLAN §6.2) — the client
// shows a spinner for the duration rather than polling a job status, since
// no job-queue infrastructure exists elsewhere in this codebase.
articlesRouter.post("/:id/summary", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = requestSummarySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ message: "Invalid request", issues: body.error.issues }, 400);

  const owned = await ownedArticleForSummary(userId, id);
  if (!owned) return c.json({ message: "Not found" }, 404);

  let provider: SummaryProviderKind | undefined = body.data.provider;
  if (!provider) {
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    provider = settings?.defaultSummaryProvider ?? undefined;
  }
  if (!provider) {
    return c.json({ message: "No provider specified and no default summary provider configured" }, 422);
  }

  const model = resolveModel(provider, body.data.model);

  const [cached] = await db
    .select()
    .from(summary)
    .where(
      and(
        eq(summary.articleId, id),
        eq(summary.userId, userId),
        eq(summary.provider, provider),
        eq(summary.model, model),
        eq(summary.promptVersion, SUMMARY_PROMPT_VERSION),
      ),
    );
  if (cached) return c.json(toSummaryDTO(cached));

  try {
    const result = await generateSummary({
      db,
      userId,
      provider,
      model,
      articleTitle: owned.title,
      articleText: owned.contentText,
    });

    let [row] = await db
      .insert(summary)
      .values({
        articleId: id,
        userId,
        provider: result.provider,
        model: result.model,
        content: result.content,
        promptVersion: result.promptVersion,
      })
      .onConflictDoNothing({
        target: [summary.articleId, summary.userId, summary.provider, summary.model, summary.promptVersion],
      })
      .returning();

    // A concurrent request may have won the race and inserted first —
    // onConflictDoNothing then returns nothing, so fetch what's there.
    if (!row) {
      [row] = await db
        .select()
        .from(summary)
        .where(
          and(
            eq(summary.articleId, id),
            eq(summary.userId, userId),
            eq(summary.provider, provider),
            eq(summary.model, model),
            eq(summary.promptVersion, SUMMARY_PROMPT_VERSION),
          ),
        );
    }
    return c.json(toSummaryDTO(row));
  } catch (err) {
    await logSummaryError(userId, id, provider, err);
    const status = err instanceof SummaryProviderError ? statusForSummaryError(err.code) : 502;
    const message = err instanceof Error ? err.message : "Failed to generate summary";
    return c.json({ message }, status);
  }
});
