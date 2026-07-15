import { z } from "zod";
import { FEED_KINDS } from "./types.js";

export const previewFeedSchema = z.object({
  url: z.url(),
});
export type PreviewFeedInput = z.infer<typeof previewFeedSchema>;

export const createFeedSchema = z.object({
  sourceUrl: z.url(),
  feedUrl: z.url(),
  kind: z.enum(FEED_KINDS),
  title: z.string().min(1).max(500),
  siteUrl: z.url().nullable().optional(),
  faviconUrl: z.url().nullable().optional(),
  tagIds: z.array(z.uuid()).optional(),
});
export type CreateFeedInput = z.infer<typeof createFeedSchema>;

export const patchFeedSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  autoSummarize: z.boolean().optional(),
  retentionReadDays: z.number().int().positive().nullable().optional(),
  retentionUnreadDays: z.number().int().positive().nullable().optional(),
  pollIntervalMinutes: z.number().int().min(5).max(1440).optional(),
  active: z.boolean().optional(),
  tagIds: z.array(z.uuid()).optional(),
});
export type PatchFeedInput = z.infer<typeof patchFeedSchema>;

export const createTagSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().max(20).nullable().optional(),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

export const patchTagSchema = createTagSchema.partial();
export type PatchTagInput = z.infer<typeof patchTagSchema>;

export const ARTICLE_VIEWS = ["unread", "starred", "cleared"] as const;
export type ArticleView = (typeof ARTICLE_VIEWS)[number];

export const listArticlesQuerySchema = z.object({
  feedId: z.uuid().optional(),
  tagId: z.uuid().optional(),
  view: z.enum(ARTICLE_VIEWS).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ListArticlesQuery = z.infer<typeof listArticlesQuerySchema>;

export const markReadSchema = z.object({ read: z.boolean() });
export type MarkReadInput = z.infer<typeof markReadSchema>;

export const starArticleSchema = z.object({ starred: z.boolean() });
export type StarArticleInput = z.infer<typeof starArticleSchema>;

export const clearArticleSchema = z.object({ cleared: z.boolean() });
export type ClearArticleInput = z.infer<typeof clearArticleSchema>;

export const readAllSchema = z.object({
  feedId: z.uuid().optional(),
  tagId: z.uuid().optional(),
});
export type ReadAllInput = z.infer<typeof readAllSchema>;
