import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  uuid,
  pgEnum,
  unique,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";

export const feedKind = pgEnum("feed_kind", ["rss", "atom", "api_hackernews", "readability"]);

export const feed = pgTable(
  "feed",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url").notNull(),
    feedUrl: text("feed_url").notNull(),
    kind: feedKind("kind").notNull(),
    title: text("title").notNull(),
    siteUrl: text("site_url"),
    faviconUrl: text("favicon_url"),
    autoSummarize: boolean("auto_summarize").default(false).notNull(),
    retentionReadDays: integer("retention_read_days"),
    retentionUnreadDays: integer("retention_unread_days"),
    pollIntervalMinutes: integer("poll_interval_minutes").default(30).notNull(),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    lastError: text("last_error"),
    consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("feed_user_id_idx").on(table.userId)],
);

export const tag = pgTable(
  "tag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("tag_user_id_name_unique").on(table.userId, table.name),
    index("tag_user_id_idx").on(table.userId),
  ],
);

export const feedTag = pgTable(
  "feed_tag",
  {
    feedId: uuid("feed_id")
      .notNull()
      .references(() => feed.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.feedId, table.tagId] }),
    index("feed_tag_tag_id_idx").on(table.tagId),
  ],
);
