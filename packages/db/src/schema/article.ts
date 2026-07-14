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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth.js";
import { feed } from "./feed.js";

export const extractionStatus = pgEnum("extraction_status", ["ok", "partial", "failed"]);

export const article = pgTable(
  "article",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feedId: uuid("feed_id")
      .notNull()
      .references(() => feed.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    guid: text("guid").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    author: text("author"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
    contentHtml: text("content_html").notNull(),
    contentText: text("content_text").notNull(),
    excerpt: text("excerpt"),
    leadImageUrl: text("lead_image_url"),
    wordCount: integer("word_count").default(0).notNull(),
    extractionStatus: extractionStatus("extraction_status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("article_feed_id_guid_unique").on(table.feedId, table.guid),
    index("article_user_id_idx").on(table.userId),
    index("article_feed_id_published_at_idx").on(table.feedId, table.publishedAt),
  ],
);

export const articleState = pgTable(
  "article_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    starred: boolean("starred").default(false).notNull(),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
  },
  (table) => [
    unique("article_state_user_id_article_id_unique").on(table.userId, table.articleId),
    index("article_state_user_id_read_at_idx").on(table.userId, table.readAt),
    index("article_state_unread_idx")
      .on(table.userId, table.articleId)
      .where(sql`${table.readAt} is null`),
  ],
);
