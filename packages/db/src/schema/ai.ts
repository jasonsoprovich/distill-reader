import {
  pgTable,
  text,
  timestamp,
  integer,
  numeric,
  uuid,
  pgEnum,
  unique,
  jsonb,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { article } from "./article.js";

export const summaryProvider = pgEnum("summary_provider", ["openai", "anthropic", "ollama"]);
export const ttsProvider = pgEnum("tts_provider", ["elevenlabs", "piper"]);

export const summary = pgTable(
  "summary",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: summaryProvider("provider").notNull(),
    model: text("model").notNull(),
    content: text("content").notNull(),
    promptVersion: text("prompt_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("summary_cache_key_unique").on(
      table.articleId,
      table.userId,
      table.provider,
      table.model,
      table.promptVersion,
    ),
  ],
);

export const ttsAudio = pgTable(
  "tts_audio",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: ttsProvider("provider").notNull(),
    voice: text("voice").notNull(),
    format: text("format").notNull(),
    storageKey: text("storage_key").notNull(),
    durationSeconds: numeric("duration_seconds"),
    charCount: integer("char_count").notNull(),
    timings: jsonb("timings"),
    settingsVersion: text("settings_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("tts_audio_cache_key_unique").on(
      table.articleId,
      table.userId,
      table.provider,
      table.voice,
      table.format,
      table.settingsVersion,
    ),
  ],
);
