import { z } from "zod";
import {
  CREDENTIAL_PROVIDERS,
  FEED_KINDS,
  READER_FONT_NAMES,
  READER_THEME_NAMES,
  SUMMARY_PROVIDERS,
  TTS_PROVIDERS,
  TTS_SOURCES,
} from "./types.js";

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

export const ARTICLE_SORT_DIRECTIONS = ["desc", "asc"] as const;
export type ArticleSortDirection = (typeof ARTICLE_SORT_DIRECTIONS)[number];

export const listArticlesQuerySchema = z.object({
  feedId: z.uuid().optional(),
  tagId: z.uuid().optional(),
  view: z.enum(ARTICLE_VIEWS).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  sortDir: z.enum(ARTICLE_SORT_DIRECTIONS).default("desc"),
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

// Providers that require a secret key; ollama/piper are self-hosted and
// addressed via baseUrl instead (PLAN §7.1/§10.3).
const KEYED_CREDENTIAL_PROVIDERS = new Set(["openai", "anthropic", "elevenlabs"]);

export const createCredentialSchema = z
  .object({
    provider: z.enum(CREDENTIAL_PROVIDERS),
    label: z.string().min(1).max(200),
    secret: z.string().min(1).max(4000).optional(),
    baseUrl: z.url().optional(),
  })
  .refine((data) => !KEYED_CREDENTIAL_PROVIDERS.has(data.provider) || Boolean(data.secret), {
    message: "secret is required for this provider",
    path: ["secret"],
  });
export type CreateCredentialInput = z.infer<typeof createCredentialSchema>;

// PLAN §8.4 — persisted as a merge-patch into user_settings.rsvp_prefs
// (jsonb), so every field stays optional here too.
export const rsvpPrefsSchema = z.object({
  wpm: z.number().int().min(100).max(1000).optional(),
  wordColor: z.string().min(1).max(30).optional(),
  backgroundColor: z.string().min(1).max(30).optional(),
  pivotColor: z.string().min(1).max(30).optional(),
  dimLevel: z.number().min(0).max(1).optional(),
  punctuationPauseEnabled: z.boolean().optional(),
  source: z.enum(TTS_SOURCES).optional(),
});
export type RsvpPrefsInput = z.infer<typeof rsvpPrefsSchema>;

// PLAN §7.3 — persisted as a merge-patch into user_settings.tts_prefs
// (jsonb), mirroring rsvpPrefsSchema's all-optional shape.
export const ttsPrefsSchema = z.object({
  voice: z.string().min(1).max(200).optional(),
  model: z.string().min(1).max(200).optional(),
  speed: z.number().min(0.5).max(2).optional(),
  highlightFollowEnabled: z.boolean().optional(),
  source: z.enum(TTS_SOURCES).optional(),
});
export type TtsPrefsInput = z.infer<typeof ttsPrefsSchema>;

// PLAN §8.3 — persisted as a merge-patch into user_settings.reader_theme
// (jsonb), same all-optional shape as rsvpPrefsSchema/ttsPrefsSchema.
export const readerThemeSchema = z.object({
  name: z.enum(READER_THEME_NAMES).optional(),
  fontSize: z.number().min(14).max(24).optional(),
  fontFamily: z.enum(READER_FONT_NAMES).optional(),
});
export type ReaderThemeInput = z.infer<typeof readerThemeSchema>;

export const patchSettingsSchema = z.object({
  defaultRetentionReadDays: z.number().int().positive().optional(),
  defaultRetentionUnreadDays: z.number().int().positive().optional(),
  readerTheme: readerThemeSchema.optional(),
  rsvpPrefs: rsvpPrefsSchema.optional(),
  ttsPrefs: ttsPrefsSchema.optional(),
  defaultSummaryProvider: z.enum(SUMMARY_PROVIDERS).nullable().optional(),
  defaultTtsProvider: z.enum(TTS_PROVIDERS).nullable().optional(),
});
export type PatchSettingsInput = z.infer<typeof patchSettingsSchema>;

export const requestSummarySchema = z.object({
  provider: z.enum(SUMMARY_PROVIDERS).optional(),
  model: z.string().min(1).max(200).optional(),
});
export type RequestSummaryInput = z.infer<typeof requestSummarySchema>;

export const requestTtsSchema = z.object({
  provider: z.enum(TTS_PROVIDERS).optional(),
  voice: z.string().min(1).max(200).optional(),
  model: z.string().min(1).max(200).optional(),
  source: z.enum(TTS_SOURCES).optional(),
});
export type RequestTtsInput = z.infer<typeof requestTtsSchema>;

export const updatePlaybackPositionSchema = z.object({
  positionSeconds: z.number().min(0),
});
export type UpdatePlaybackPositionInput = z.infer<typeof updatePlaybackPositionSchema>;
