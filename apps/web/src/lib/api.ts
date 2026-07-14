import type {
  ArticleDetailDTO,
  ArticlesPage,
  CreateFeedInput,
  DiscoveredFeed,
  FeedDTO,
  TagDTO,
} from "@distill/shared";

const API_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body: { message?: string } | null = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.message ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface ListArticlesParams {
  feedId?: string;
  tagId?: string;
  cursor?: string;
}

export const api = {
  listFeeds: () => apiFetch<FeedDTO[]>("/feeds"),
  previewFeed: (url: string) =>
    apiFetch<DiscoveredFeed>("/feeds/preview", { method: "POST", body: JSON.stringify({ url }) }),
  createFeed: (input: CreateFeedInput) =>
    apiFetch<FeedDTO>("/feeds", { method: "POST", body: JSON.stringify(input) }),
  pollFeed: (id: string) => apiFetch<unknown>(`/feeds/${id}/poll`, { method: "POST" }),
  deleteFeed: (id: string) => apiFetch<void>(`/feeds/${id}`, { method: "DELETE" }),

  listTags: () => apiFetch<TagDTO[]>("/tags"),
  createTag: (input: { name: string; color?: string | null }) =>
    apiFetch<TagDTO>("/tags", { method: "POST", body: JSON.stringify(input) }),

  listArticles: (params: ListArticlesParams) => {
    const search = new URLSearchParams();
    if (params.feedId) search.set("feedId", params.feedId);
    if (params.tagId) search.set("tagId", params.tagId);
    if (params.cursor) search.set("cursor", params.cursor);
    const qs = search.toString();
    return apiFetch<ArticlesPage>(`/articles${qs ? `?${qs}` : ""}`);
  },
  getArticle: (id: string) => apiFetch<ArticleDetailDTO>(`/articles/${id}`),
};
