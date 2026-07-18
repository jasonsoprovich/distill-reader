import { eq } from "drizzle-orm";
import { db, userSettings } from "@distill/db";
import { patchSettingsSchema } from "@distill/shared";
import type { SettingsDTO } from "@distill/shared";
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

export const settingsRouter = new Hono<{ Variables: AuthVariables }>();
settingsRouter.use("*", requireAuth);

// No user_settings row is created at sign-up, so every route here
// lazy-creates one on first access — the table's column defaults (PLAN §4)
// are then the source of truth for an untouched user.
async function ensureSettingsRow(userId: string): Promise<typeof userSettings.$inferSelect> {
  const [existing] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  if (existing) return existing;
  const [row] = await db.insert(userSettings).values({ userId }).returning();
  return row;
}

function toDTO(row: typeof userSettings.$inferSelect): SettingsDTO {
  return {
    defaultRetentionReadDays: row.defaultRetentionReadDays,
    defaultRetentionUnreadDays: row.defaultRetentionUnreadDays,
    defaultPollIntervalMinutes: row.defaultPollIntervalMinutes,
    readerTheme: row.readerTheme as SettingsDTO["readerTheme"],
    rsvpPrefs: row.rsvpPrefs as SettingsDTO["rsvpPrefs"],
    ttsPrefs: row.ttsPrefs as SettingsDTO["ttsPrefs"],
    defaultSummaryProvider: row.defaultSummaryProvider,
    defaultTtsProvider: row.defaultTtsProvider,
  };
}

settingsRouter.get("/", async (c) => {
  const userId = c.get("userId");
  const row = await ensureSettingsRow(userId);
  return c.json(toDTO(row));
});

settingsRouter.patch("/", async (c) => {
  const userId = c.get("userId");
  const body = patchSettingsSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ message: "Invalid request", issues: body.error.issues }, 400);

  const existing = await ensureSettingsRow(userId);

  // readerTheme/rsvpPrefs/ttsPrefs are jsonb columns meant to be merge-patched
  // (each field schema is all-optional for exactly this reason) — but
  // `db.update().set()` replaces a jsonb column's value wholesale rather than
  // merging it. Left as a plain passthrough, a patch touching only one field
  // (e.g. { ttsPrefs: { source } } after picking Listen) would silently wipe
  // every other previously-saved field in that same column.
  const { readerTheme, rsvpPrefs, ttsPrefs, ...rest } = body.data;
  const patch: Record<string, unknown> = { ...rest };
  if (readerTheme) patch.readerTheme = { ...(existing.readerTheme as object), ...readerTheme };
  if (rsvpPrefs) patch.rsvpPrefs = { ...(existing.rsvpPrefs as object), ...rsvpPrefs };
  if (ttsPrefs) patch.ttsPrefs = { ...(existing.ttsPrefs as object), ...ttsPrefs };

  const [row] = Object.keys(patch).length
    ? await db.update(userSettings).set(patch).where(eq(userSettings.userId, userId)).returning()
    : [existing];

  return c.json(toDTO(row));
});
