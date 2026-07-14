import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateFeedInput } from "@distill/shared";
import { api } from "./api";

export const feedsQueryKey = ["feeds"] as const;
export const tagsQueryKey = ["tags"] as const;
export const articlesQueryKey = (feedId?: string, tagId?: string) =>
  ["articles", { feedId, tagId }] as const;
export const articleQueryKey = (id: string) => ["article", id] as const;

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

export function useDeleteFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteFeed(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedsQueryKey }),
  });
}

export function usePollFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.pollFeed(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedsQueryKey });
      queryClient.invalidateQueries({ queryKey: ["articles"] });
    },
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
  });
}

export function useArticles(feedId?: string, tagId?: string) {
  return useInfiniteQuery({
    queryKey: articlesQueryKey(feedId, tagId),
    queryFn: ({ pageParam }) => api.listArticles({ feedId, tagId, cursor: pageParam }),
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
