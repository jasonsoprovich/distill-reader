import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { article, articleState, auditLog, db, feed, feedTag, summary, ttsAudio, userSettings } from "@distill/db";
import {
  generateSummary,
  generateTts,
  resolveModel,
  resolveTtsVoice,
  SUMMARY_PROMPT_VERSION,
  SummaryProviderError,
  TTS_FORMATS,
  TTS_SETTINGS_VERSION,
  TtsProviderError,
} from "@distill/providers";
import {
  clearArticleSchema,
  listArticlesQuerySchema,
  markReadSchema,
  readAllSchema,
  requestSummarySchema,
  requestTtsSchema,
  starArticleSchema,
  updatePlaybackPositionSchema,
} from "@distill/shared";
import type {
  ArticleDetailDTO,
  ArticleListItemDTO,
  ArticlesPage,
  SummaryDTO,
  SummaryProviderKind,
  TtsAudioDTO,
  TtsProviderKind,
  TtsSource,
} from "@distill/shared";
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { costlyRouteRateLimit } from "../middleware/rate-limit.js";

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
  patch: Partial<{
    readAt: Date | null;
    starred: boolean;
    clearedAt: Date | null;
    lastPlaybackPositionSeconds: string | null;
  }>,
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
    // Default view excludes removed ("cleared") articles.
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
      contentText: article.contentText,
      discussionUrl: article.discussionUrl,
      readAt: articleState.readAt,
      starred: articleState.starred,
      clearedAt: articleState.clearedAt,
      lastPlaybackPositionSeconds: articleState.lastPlaybackPositionSeconds,
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
    playbackPositionSeconds:
      row.lastPlaybackPositionSeconds != null ? Number(row.lastPlaybackPositionSeconds) : null,
  };
  return c.json(dto);
});

// Resume position for the TTS audio player (PLAN §7.3); stored per-user on
// article_state like read/star/clear, not tied to a specific tts_audio row
// (voice/provider can change between listens without losing the position).
articlesRouter.post("/:id/playback-position", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = updatePlaybackPositionSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ message: "Invalid request", issues: body.error.issues }, 400);

  const row = await upsertArticleState(userId, id, {
    lastPlaybackPositionSeconds: String(body.data.positionSeconds),
  });
  if (!row) return c.json({ message: "Not found" }, 404);
  return c.json({
    positionSeconds: row.lastPlaybackPositionSeconds != null ? Number(row.lastPlaybackPositionSeconds) : null,
  });
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

// Shared by both the summary and TTS routes below — both need only the
// article's title/text and an ownership check.
async function ownedArticleWithText(userId: string, id: string) {
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

  const owned = await ownedArticleWithText(userId, id);
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
articlesRouter.post("/:id/summary", costlyRouteRateLimit, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = requestSummarySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ message: "Invalid request", issues: body.error.issues }, 400);

  const owned = await ownedArticleWithText(userId, id);
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

function audioStoragePath(): string {
  return process.env.AUDIO_STORAGE_PATH ?? "/data/audio";
}

// Absolute URL (same convention as the signed image proxy in
// packages/extract/src/image-proxy.ts): the player's <audio src> points
// straight at the API's own public origin, not a relative path the SPA
// would need to prefix itself.
function ttsAudioUrl(id: string): string {
  const apiOrigin = (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
  return `${apiOrigin}/tts/audio/${id}`;
}

function toTtsAudioDTO(row: typeof ttsAudio.$inferSelect): TtsAudioDTO {
  return {
    provider: row.provider,
    voice: row.voice,
    format: row.format,
    source: row.source,
    durationSeconds: row.durationSeconds != null ? Number(row.durationSeconds) : null,
    charCount: row.charCount,
    timings: row.timings as TtsAudioDTO["timings"],
    createdAt: row.createdAt.toISOString(),
    url: ttsAudioUrl(row.id),
  };
}

// Maps a provider failure to a client-actionable status — never a bare 500
// (same anti-silent-failure rule as summaries, PLAN §7.2).
function statusForTtsError(code: TtsProviderError["code"]): 401 | 429 | 502 | 504 {
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

async function logTtsError(userId: string, articleId: string, provider: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const code = err instanceof TtsProviderError ? err.code : "unknown";
  await db.insert(auditLog).values({
    userId,
    action: "tts_error",
    targetType: "article",
    targetId: articleId,
    metadata: { provider, code, message },
  });
}

function ttsCacheConditions(
  id: string,
  userId: string,
  provider: TtsProviderKind,
  voice: string,
  format: string,
  source: TtsSource,
) {
  return and(
    eq(ttsAudio.articleId, id),
    eq(ttsAudio.userId, userId),
    eq(ttsAudio.provider, provider),
    eq(ttsAudio.voice, voice),
    eq(ttsAudio.format, format),
    eq(ttsAudio.source, source),
    eq(ttsAudio.settingsVersion, TTS_SETTINGS_VERSION),
  );
}

// Resolves the text to narrate/speed-read for a given source choice. For
// "summary" there's no provider/model pinned down at this layer (mirrors
// GET /:id/summary's own cache-only, provider-agnostic lookup) — the most
// recently generated cached summary for this article/user wins. Returns
// null if source is "summary" but none has been generated yet, so callers
// can prompt the user to summarize first rather than silently falling back
// to the full article (PLAN §7.2).
async function resolveTtsSourceText(userId: string, articleId: string, source: TtsSource, fullText: string) {
  if (source === "full") return fullText;
  const [cachedSummary] = await db
    .select({ content: summary.content })
    .from(summary)
    .where(and(eq(summary.articleId, articleId), eq(summary.userId, userId)))
    .orderBy(desc(summary.createdAt))
    .limit(1);
  return cachedSummary?.content ?? null;
}

// Cached only — mirrors GET /:id/summary; never triggers generation, so
// it's safe to call on every article view without incurring provider cost.
articlesRouter.get("/:id/tts", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const query = requestTtsSchema.safeParse(c.req.query());
  if (!query.success) return c.json({ message: "Invalid query", issues: query.error.issues }, 400);

  const owned = await ownedArticleWithText(userId, id);
  if (!owned) return c.json({ message: "Not found" }, 404);

  const conditions = [
    eq(ttsAudio.articleId, id),
    eq(ttsAudio.userId, userId),
    eq(ttsAudio.source, query.data.source ?? "full"),
    eq(ttsAudio.settingsVersion, TTS_SETTINGS_VERSION),
  ];
  if (query.data.provider) conditions.push(eq(ttsAudio.provider, query.data.provider));
  if (query.data.voice) conditions.push(eq(ttsAudio.voice, query.data.voice));

  const [row] = await db.select().from(ttsAudio).where(and(...conditions)).orderBy(desc(ttsAudio.createdAt)).limit(1);
  if (!row) return c.json({ message: "No cached audio" }, 404);
  return c.json(toTtsAudioDTO(row));
});

// On-demand: cache hit returns immediately; a miss synthesizes
// synchronously under generateTts()'s own bounded per-chunk timeouts
// (mirrors POST /:id/summary — no job-queue infrastructure exists
// elsewhere in this codebase) and writes the resulting file to
// AUDIO_STORAGE_PATH before returning.
articlesRouter.post("/:id/tts", costlyRouteRateLimit, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = requestTtsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ message: "Invalid request", issues: body.error.issues }, 400);

  const owned = await ownedArticleWithText(userId, id);
  if (!owned) return c.json({ message: "Not found" }, 404);

  let provider: TtsProviderKind | undefined = body.data.provider;
  if (!provider) {
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    provider = settings?.defaultTtsProvider ?? undefined;
  }
  if (!provider) {
    return c.json({ message: "No provider specified and no default TTS provider configured" }, 422);
  }

  const voice = resolveTtsVoice(provider, body.data.voice);
  const format = TTS_FORMATS[provider];
  const source: TtsSource = body.data.source ?? "full";

  const [cached] = await db
    .select()
    .from(ttsAudio)
    .where(ttsCacheConditions(id, userId, provider, voice, format, source));
  if (cached) return c.json(toTtsAudioDTO(cached));

  const articleText = await resolveTtsSourceText(userId, id, source, owned.contentText);
  if (articleText == null) {
    return c.json({ message: "No cached summary yet — generate a summary first, or narrate the full article" }, 422);
  }

  try {
    const result = await generateTts({ db, userId, provider, voice, articleText });

    // Hashed rather than built from the raw voice string, which may contain
    // characters unsafe in a filename (and is otherwise untrusted input).
    const storageKey = `${createHash("sha256")
      .update(`${id}:${userId}:${result.provider}:${result.voice}:${result.format}:${source}:${result.settingsVersion}`)
      .digest("hex")}.${result.format}`;

    // Synthesis (and, for paid providers, the credit spend) has already
    // happened above — a storage failure past this point must not discard
    // audio the user already paid for. Caching and the network call are
    // kept in their own try/catch so a bad AUDIO_STORAGE_PATH degrades to
    // inline, uncached playback instead of a bare error with nothing to play.
    try {
      await mkdir(audioStoragePath(), { recursive: true });
      await writeFile(path.join(audioStoragePath(), storageKey), result.audio);
    } catch (storageErr) {
      console.error(
        `TTS audio storage write failed (AUDIO_STORAGE_PATH=${audioStoragePath()}); serving inline instead of caching:`,
        storageErr,
      );
      const contentType = result.format === "wav" ? "audio/wav" : "audio/mpeg";
      const inline: TtsAudioDTO = {
        provider: result.provider,
        voice: result.voice,
        format: result.format,
        source,
        durationSeconds: result.durationSeconds,
        charCount: result.charCount,
        timings: result.timings,
        createdAt: new Date().toISOString(),
        url: `data:${contentType};base64,${result.audio.toString("base64")}`,
      };
      return c.json(inline);
    }

    let [row] = await db
      .insert(ttsAudio)
      .values({
        articleId: id,
        userId,
        provider: result.provider,
        voice: result.voice,
        format: result.format,
        source,
        storageKey,
        durationSeconds: result.durationSeconds != null ? String(result.durationSeconds) : null,
        charCount: result.charCount,
        timings: result.timings,
        settingsVersion: result.settingsVersion,
      })
      .onConflictDoNothing({
        target: [
          ttsAudio.articleId,
          ttsAudio.userId,
          ttsAudio.provider,
          ttsAudio.voice,
          ttsAudio.format,
          ttsAudio.source,
          ttsAudio.settingsVersion,
        ],
      })
      .returning();

    // A concurrent request may have won the race and inserted first —
    // onConflictDoNothing then returns nothing, so fetch what's there.
    if (!row) {
      [row] = await db
        .select()
        .from(ttsAudio)
        .where(ttsCacheConditions(id, userId, provider, voice, format, source));
    }
    return c.json(toTtsAudioDTO(row));
  } catch (err) {
    await logTtsError(userId, id, provider, err);
    const status = err instanceof TtsProviderError ? statusForTtsError(err.code) : 502;
    const message = err instanceof Error ? err.message : "Failed to generate audio";
    return c.json({ message }, status);
  }
});
