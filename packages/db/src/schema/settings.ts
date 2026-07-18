import { pgTable, text, integer, uuid, pgEnum, jsonb, timestamp, customType } from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { summaryProvider, ttsProvider } from "./ai.js";

export const credentialProvider = pgEnum("credential_provider", [
  "openai",
  "anthropic",
  "ollama",
  "elevenlabs",
  "piper",
  "kokoro",
]);

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  defaultRetentionReadDays: integer("default_retention_read_days").default(30).notNull(),
  defaultRetentionUnreadDays: integer("default_retention_unread_days").default(90).notNull(),
  // Pre-fills a new feed's poll_interval_minutes at creation time (AddFeedDialog) — feed.pollIntervalMinutes
  // itself is NOT NULL with its own DB default, so unlike retention this isn't a live per-poll fallback.
  defaultPollIntervalMinutes: integer("default_poll_interval_minutes").default(30).notNull(),
  readerTheme: jsonb("reader_theme").notNull().default({}),
  rsvpPrefs: jsonb("rsvp_prefs").notNull().default({}),
  ttsPrefs: jsonb("tts_prefs").notNull().default({}),
  defaultSummaryProvider: summaryProvider("default_summary_provider"),
  defaultTtsProvider: ttsProvider("default_tts_provider"),
});

// AEAD-encrypted secret material; null for keyless local providers (Ollama, Piper).
export const apiCredential = pgTable("api_credential", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: credentialProvider("provider").notNull(),
  label: text("label").notNull(),
  secretEncrypted: bytea("secret_encrypted"),
  baseUrl: text("base_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
