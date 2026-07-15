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
    readerTheme: row.readerTheme as Record<string, unknown>,
    rsvpPrefs: row.rsvpPrefs as Record<string, unknown>,
    ttsPrefs: row.ttsPrefs as Record<string, unknown>,
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

  await ensureSettingsRow(userId);
  const [row] = Object.keys(body.data).length
    ? await db.update(userSettings).set(body.data).where(eq(userSettings.userId, userId)).returning()
    : await db.select().from(userSettings).where(eq(userSettings.userId, userId));

  return c.json(toDTO(row));
});
