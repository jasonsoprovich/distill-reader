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
export const ttsProvider = pgEnum("tts_provider", ["elevenlabs", "piper", "openai"]);
export const ttsSource = pgEnum("tts_source", ["full", "summary"]);

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
    // Only meaningful for providers with a model concept (ElevenLabs) — ""
    // for Piper, which has none. NOT NULL with a "" default rather than
    // nullable: Postgres unique constraints treat every NULL as distinct
    // from every other NULL, so a nullable column here would silently defeat
    // onConflictDoNothing's dedup for Piper (whose model is always empty).
    model: text("model").notNull().default(""),
    format: text("format").notNull(),
    // Full article vs. AI summary narration — distinct character counts (and
    // per docs/COMPLIANCE.md, distinct copyright-exposure profile), so it's
    // part of the cache key rather than an overwrite of the same row.
    source: ttsSource("source").notNull().default("full"),
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
      table.model,
      table.format,
      table.source,
      table.settingsVersion,
    ),
  ],
);
