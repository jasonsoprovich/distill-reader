import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import type {
  ArticleDetailDTO,
  ArticleListItemDTO,
  ArticlesPage,
  ArticleSortDirection,
  ArticleView,
  CreateCredentialInput,
  CreateFeedInput,
  FeedDTO,
  PatchFeedInput,
  PatchSettingsInput,
  PatchTagInput,
  SummaryProviderKind,
  TtsProviderKind,
  TtsSource,
} from "@distill/shared";
import { api, ApiError, type ReadAllParams } from "./api";
import { toast } from "./toast";

export const feedsQueryKey = ["feeds"] as const;
export const tagsQueryKey = ["tags"] as const;
export const articlesQueryKey = (feedId?: string, tagId?: string, view?: ArticleView, sortDir?: ArticleSortDirection) =>
  ["articles", { feedId, tagId, view, sortDir }] as const;
export const articleQueryKey = (id: string) => ["article", id] as const;
export const summaryQueryKey = (articleId: string) => ["summary", articleId] as const;
export const ttsAudioQueryKey = (articleId: string, source: TtsSource = "full") =>
  ["tts-audio", articleId, source] as const;
export const ttsVoicesQueryKey = (provider: TtsProviderKind) => ["tts-voices", provider] as const;
export const credentialsQueryKey = ["credentials"] as const;
export const settingsQueryKey = ["settings"] as const;

export function useFeeds() {
  return useQuery({ queryKey: feedsQueryKey, queryFn: api.listFeeds });
}

export function usePreviewFeed() {
  return useMutation({ mutationFn: (url: string) => api.previewFeed(url) });
}

export function useCreateFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFeedInput) => api.createFeed(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedsQueryKey }),
  });
}

export function useUpdateFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PatchFeedInput }) => api.updateFeed(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedsQueryKey }),
    onError: () => toast("Couldn't update that feed — try again.", "error"),
  });
}

export function useDeleteFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteFeed(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedsQueryKey });
      queryClient.invalidateQueries({ queryKey: ["articles"] });
    },
    onError: () => toast("Couldn't delete that feed — try again.", "error"),
  });
}

export function usePollFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.pollFeed(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: feedsQueryKey });
      queryClient.invalidateQueries({ queryKey: ["articles"] });
      // The poll can legitimately find nothing new (e.g. dedup against
      // already-ingested items) — without this the button silently
      // succeeding reads identically to it doing nothing at all.
      toast(
        result.articlesInserted > 0
          ? `Refreshed — ${result.articlesInserted} new article${result.articlesInserted === 1 ? "" : "s"}.`
          : "Refreshed — no new articles.",
      );
    },
    onError: () => toast("Couldn't refresh that feed — try again.", "error"),
  });
}

// No bulk-poll endpoint exists server-side, so this fires one poll per feed
// in parallel and tolerates individual failures (a dead feed shouldn't stop
// the rest from refreshing) — mirrors ArticleList's runBulk pattern.
export function useRefreshAllFeeds() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (feeds: FeedDTO[]) => {
      const results = await Promise.allSettled(feeds.map((f) => api.pollFeed(f.id)));
      const inserted = results.reduce(
        (sum, r) => sum + (r.status === "fulfilled" ? r.value.articlesInserted : 0),
        0,
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      return { inserted, failed };
    },
    onSuccess: ({ inserted, failed }) => {
      queryClient.invalidateQueries({ queryKey: feedsQueryKey });
      queryClient.invalidateQueries({ queryKey: ["articles"] });
      const base = inserted > 0 ? `Refreshed — ${inserted} new article${inserted === 1 ? "" : "s"}.` : "Refreshed — no new articles.";
      toast(failed > 0 ? `${base} ${failed} feed${failed === 1 ? "" : "s"} failed.` : base, failed > 0 ? "error" : "default");
    },
    onError: () => toast("Couldn't refresh feeds — try again.", "error"),
  });
}

export function useTags() {
  return useQuery({ queryKey: tagsQueryKey, queryFn: api.listTags });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; color?: string | null }) => api.createTag(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tagsQueryKey }),
    onError: () => toast("Couldn't create that tag — try again.", "error"),
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PatchTagInput }) => api.updateTag(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tagsQueryKey }),
    onError: () => toast("Couldn't update that tag — try again.", "error"),
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTag(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagsQueryKey });
      queryClient.invalidateQueries({ queryKey: feedsQueryKey });
    },
    onError: () => toast("Couldn't delete that tag — try again.", "error"),
  });
}

export function useArticles(feedId?: string, tagId?: string, view?: ArticleView, sortDir?: ArticleSortDirection) {
  return useInfiniteQuery({
    queryKey: articlesQueryKey(feedId, tagId, view, sortDir),
    queryFn: ({ pageParam }) => api.listArticles({ feedId, tagId, view, sortDir, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useArticle(id: string | null) {
  return useQuery({
    queryKey: articleQueryKey(id ?? "none"),
    queryFn: () => api.getArticle(id as string),
    enabled: Boolean(id),
  });
}

// --- Read / star / clear -----------------------------------------------
//
// All three mutate a single article's state. They apply the change to
// every cached article list (across feed/tag/view combinations) and the
// article detail cache immediately for a responsive feel, roll back to
// the pre-mutation snapshot on failure (with a toast), then invalidate on
// settle so server-side view membership (e.g. an article leaving the
// Unread list) reconciles for real.

type ArticlePatch = Partial<Pick<ArticleListItemDTO, "readAt" | "starred" | "clearedAt">>;

interface ArticleMutationContext {
  previousLists: [QueryKey, InfiniteData<ArticlesPage> | undefined][];
  previousDetail: ArticleDetailDTO | undefined;
}

function applyArticlePatch(queryClient: QueryClient, id: string, patch: ArticlePatch) {
  queryClient.setQueriesData<InfiniteData<ArticlesPage>>({ queryKey: ["articles"] }, (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      })),
    };
  });
  queryClient.setQueryData<ArticleDetailDTO>(articleQueryKey(id), (data) =>
    data ? { ...data, ...patch } : data,
  );
}

async function beginOptimisticPatch(
  queryClient: QueryClient,
  id: string,
  patch: ArticlePatch,
): Promise<ArticleMutationContext> {
  await queryClient.cancelQueries({ queryKey: ["articles"] });
  await queryClient.cancelQueries({ queryKey: articleQueryKey(id) });

  const previousLists = queryClient.getQueriesData<InfiniteData<ArticlesPage>>({ queryKey: ["articles"] });
  const previousDetail = queryClient.getQueryData<ArticleDetailDTO>(articleQueryKey(id));

  applyArticlePatch(queryClient, id, patch);

  return { previousLists, previousDetail };
}

function rollbackOptimisticPatch(
  queryClient: QueryClient,
  id: string,
  context: ArticleMutationContext | undefined,
) {
  if (!context) return;
  for (const [key, data] of context.previousLists) {
    queryClient.setQueryData(key, data);
  }
  queryClient.setQueryData(articleQueryKey(id), context.previousDetail);
}

function settleArticleMutation(queryClient: QueryClient, id: string) {
  queryClient.invalidateQueries({ queryKey: ["articles"] });
  queryClient.invalidateQueries({ queryKey: articleQueryKey(id) });
  queryClient.invalidateQueries({ queryKey: feedsQueryKey });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) => api.markRead(id, read),
    onMutate: ({ id, read }) =>
      beginOptimisticPatch(queryClient, id, { readAt: read ? new Date().toISOString() : null }),
    onError: (_err, { id }, context) => {
      rollbackOptimisticPatch(queryClient, id, context);
      toast("Couldn't update read status — try again.", "error");
    },
    onSettled: (_data, _err, { id }) => settleArticleMutation(queryClient, id),
  });
}

export function useStarArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) => api.starArticle(id, starred),
    onMutate: ({ id, starred }) => beginOptimisticPatch(queryClient, id, { starred }),
    onError: (_err, { id }, context) => {
      rollbackOptimisticPatch(queryClient, id, context);
      toast("Couldn't update star — try again.", "error");
    },
    onSettled: (_data, _err, { id }) => settleArticleMutation(queryClient, id),
  });
}

export function useClearArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cleared }: { id: string; cleared: boolean }) => api.clearArticle(id, cleared),
    onMutate: ({ id, cleared }) =>
      beginOptimisticPatch(queryClient, id, { clearedAt: cleared ? new Date().toISOString() : null }),
    onError: (_err, { id }, context) => {
      rollbackOptimisticPatch(queryClient, id, context);
      toast("Couldn't update article — try again.", "error");
    },
    onSettled: (_data, _err, { id }) => settleArticleMutation(queryClient, id),
  });
}

export function useReadAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: ReadAllParams) => api.readAllArticles(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["articles"] });
      queryClient.invalidateQueries({ queryKey: feedsQueryKey });
    },
    onError: () => toast("Couldn't mark all as read — try again.", "error"),
  });
}

// --- AI summaries --------------------------------------------------------

export function useSummary(articleId: string | null) {
  return useQuery({
    queryKey: summaryQueryKey(articleId ?? "none"),
    queryFn: () => api.getSummary(articleId as string),
    enabled: Boolean(articleId),
  });
}

export function useRequestSummary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ articleId, provider }: { articleId: string; provider?: SummaryProviderKind }) =>
      api.requestSummary(articleId, provider),
    onSuccess: (summary, { articleId }) => {
      queryClient.setQueryData(summaryQueryKey(articleId), summary);
    },
    onError: (err) => {
      toast(err instanceof ApiError ? err.message : "Couldn't generate a summary — try again.", "error");
    },
  });
}

// --- TTS audio narration ---------------------------------------------------

export function useTtsAudio(articleId: string | null, source: TtsSource = "full") {
  return useQuery({
    queryKey: ttsAudioQueryKey(articleId ?? "none", source),
    queryFn: () => api.getTtsAudio(articleId as string, source),
    enabled: Boolean(articleId),
  });
}

export function useRequestTts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      articleId,
      provider,
      voice,
      model,
      source,
    }: {
      articleId: string;
      provider?: TtsProviderKind;
      voice?: string;
      model?: string;
      source?: TtsSource;
    }) => api.requestTts(articleId, { provider, voice, model, source }),
    onSuccess: (audio, { articleId, source }) => {
      queryClient.setQueryData(ttsAudioQueryKey(articleId, source ?? "full"), audio);
    },
    onError: (err) => {
      toast(err instanceof ApiError ? err.message : "Couldn't generate audio — try again.", "error");
    },
  });
}

export function useTtsVoices(provider: TtsProviderKind | null) {
  return useQuery({
    queryKey: ttsVoicesQueryKey(provider ?? "elevenlabs"),
    queryFn: () => api.listTtsVoices(provider as TtsProviderKind),
    enabled: Boolean(provider),
    staleTime: 5 * 60 * 1000,
  });
}

// Fire-and-forget: losing a resume-position update isn't worth a toast, and
// there's nothing for the UI to roll back (the player just keeps playing).
export function useUpdatePlaybackPosition() {
  return useMutation({
    mutationFn: ({ articleId, positionSeconds }: { articleId: string; positionSeconds: number }) =>
      api.updatePlaybackPosition(articleId, positionSeconds),
  });
}

// --- Credentials & settings ----------------------------------------------

export function useCredentials() {
  return useQuery({ queryKey: credentialsQueryKey, queryFn: api.listCredentials });
}

export function useCreateCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCredentialInput) => api.createCredential(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: credentialsQueryKey }),
  });
}

export function useDeleteCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteCredential(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: credentialsQueryKey }),
    onError: () => toast("Couldn't delete that credential — try again.", "error"),
  });
}

export function useSettings() {
  return useQuery({ queryKey: settingsQueryKey, queryFn: api.getSettings });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: PatchSettingsInput) => api.updateSettings(patch),
    onSuccess: (settings) => queryClient.setQueryData(settingsQueryKey, settings),
    onError: () => toast("Couldn't update settings — try again.", "error"),
  });
}
