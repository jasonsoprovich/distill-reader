import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { article, articleState, db, feed, ttsAudio, userSettings } from "@distill/db";
import { unlink } from "node:fs/promises";
import path from "node:path";

const DEFAULT_RETENTION_READ_DAYS = 30;
const DEFAULT_RETENTION_UNREAD_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function audioStoragePath(): string {
  return process.env.AUDIO_STORAGE_PATH ?? "/data/audio";
}

async function deleteOrphanedAudio(articleIds: string[]): Promise<void> {
  const rows = await db
    .select({ storageKey: ttsAudio.storageKey })
    .from(ttsAudio)
    .where(inArray(ttsAudio.articleId, articleIds));

  await Promise.all(
    rows.map(async (row) => {
      try {
        await unlink(path.join(audioStoragePath(), row.storageKey));
      } catch (err) {
        console.error(`[worker] failed to delete audio file "${row.storageKey}"`, err);
      }
    }),
  );
}

// Retention (PLAN §5 / user_settings): read articles older than X days and
// unread articles older than Y days are purged; starred articles are kept
// forever. A feed's own retention_read_days/retention_unread_days override
// the user's account-wide defaults when set. Runs per-feed so each feed's
// overrides apply independently, and deletes any orphaned audio files
// (article delete cascades the DB rows, but not the files on disk).
export async function runPurge(): Promise<number> {
  const [feeds, settingsRows] = await Promise.all([db.select().from(feed), db.select().from(userSettings)]);
  const settingsByUser = new Map(settingsRows.map((s) => [s.userId, s]));

  let purgedTotal = 0;
  for (const f of feeds) {
    const settings = settingsByUser.get(f.userId);
    const readDays = f.retentionReadDays ?? settings?.defaultRetentionReadDays ?? DEFAULT_RETENTION_READ_DAYS;
    const unreadDays =
      f.retentionUnreadDays ?? settings?.defaultRetentionUnreadDays ?? DEFAULT_RETENTION_UNREAD_DAYS;
    const readCutoff = new Date(Date.now() - readDays * DAY_MS);
    const unreadCutoff = new Date(Date.now() - unreadDays * DAY_MS);

    const candidates = await db
      .select({ id: article.id })
      .from(article)
      .leftJoin(articleState, eq(articleState.articleId, article.id))
      .where(
        and(
          eq(article.feedId, f.id),
          or(isNull(articleState.starred), eq(articleState.starred, false)),
          or(
            and(isNotNull(articleState.readAt), lt(articleState.readAt, readCutoff)),
            and(isNull(articleState.readAt), lt(article.fetchedAt, unreadCutoff)),
          ),
        ),
      );
    if (!candidates.length) continue;

    const ids = candidates.map((row) => row.id);
    await deleteOrphanedAudio(ids);
    await db.delete(article).where(inArray(article.id, ids));
    purgedTotal += ids.length;
  }
  return purgedTotal;
}
