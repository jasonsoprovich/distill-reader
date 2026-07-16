import type {
  ArticleDetailDTO,
  ArticlesPage,
  ArticleView,
  CreateCredentialInput,
  CreateFeedInput,
  CredentialDTO,
  DiscoveredFeed,
  FeedDTO,
  FeedPollResultDTO,
  PatchSettingsInput,
  SettingsDTO,
  SummaryDTO,
  SummaryProviderKind,
  TagDTO,
  TtsAudioDTO,
  TtsProviderKind,
  TtsSource,
  TtsVoiceDTO,
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
  view?: ArticleView;
  cursor?: string;
}

export interface ReadAllParams {
  feedId?: string;
  tagId?: string;
}

export const api = {
  listFeeds: () => apiFetch<FeedDTO[]>("/feeds"),
  previewFeed: (url: string) =>
    apiFetch<DiscoveredFeed>("/feeds/preview", { method: "POST", body: JSON.stringify({ url }) }),
  createFeed: (input: CreateFeedInput) =>
    apiFetch<FeedDTO>("/feeds", { method: "POST", body: JSON.stringify(input) }),
  pollFeed: (id: string) => apiFetch<FeedPollResultDTO>(`/feeds/${id}/poll`, { method: "POST" }),
  deleteFeed: (id: string) => apiFetch<void>(`/feeds/${id}`, { method: "DELETE" }),

  listTags: () => apiFetch<TagDTO[]>("/tags"),
  createTag: (input: { name: string; color?: string | null }) =>
    apiFetch<TagDTO>("/tags", { method: "POST", body: JSON.stringify(input) }),

  listArticles: (params: ListArticlesParams) => {
    const search = new URLSearchParams();
    if (params.feedId) search.set("feedId", params.feedId);
    if (params.tagId) search.set("tagId", params.tagId);
    if (params.view) search.set("view", params.view);
    if (params.cursor) search.set("cursor", params.cursor);
    const qs = search.toString();
    return apiFetch<ArticlesPage>(`/articles${qs ? `?${qs}` : ""}`);
  },
  getArticle: (id: string) => apiFetch<ArticleDetailDTO>(`/articles/${id}`),
  markRead: (id: string, read: boolean) =>
    apiFetch<{ readAt: string | null }>(`/articles/${id}/read`, {
      method: "POST",
      body: JSON.stringify({ read }),
    }),
  starArticle: (id: string, starred: boolean) =>
    apiFetch<{ starred: boolean }>(`/articles/${id}/star`, {
      method: "POST",
      body: JSON.stringify({ starred }),
    }),
  clearArticle: (id: string, cleared: boolean) =>
    apiFetch<{ clearedAt: string | null }>(`/articles/${id}/clear`, {
      method: "POST",
      body: JSON.stringify({ cleared }),
    }),
  readAllArticles: (params: ReadAllParams) =>
    apiFetch<{ updated: number }>("/articles/read-all", { method: "POST", body: JSON.stringify(params) }),

  getSummary: async (articleId: string) => {
    try {
      return await apiFetch<SummaryDTO>(`/articles/${articleId}/summary`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
  requestSummary: (articleId: string, provider?: SummaryProviderKind) =>
    apiFetch<SummaryDTO>(`/articles/${articleId}/summary`, {
      method: "POST",
      body: JSON.stringify(provider ? { provider } : {}),
    }),

  getTtsAudio: async (articleId: string, source?: TtsSource) => {
    try {
      const qs = source ? `?source=${encodeURIComponent(source)}` : "";
      return await apiFetch<TtsAudioDTO>(`/articles/${articleId}/tts${qs}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
  requestTts: (
    articleId: string,
    opts: { provider?: TtsProviderKind; voice?: string; model?: string; source?: TtsSource } = {},
  ) => apiFetch<TtsAudioDTO>(`/articles/${articleId}/tts`, { method: "POST", body: JSON.stringify(opts) }),
  updatePlaybackPosition: (articleId: string, positionSeconds: number) =>
    apiFetch<{ positionSeconds: number | null }>(`/articles/${articleId}/playback-position`, {
      method: "POST",
      body: JSON.stringify({ positionSeconds }),
    }),
  listTtsVoices: (provider: TtsProviderKind) =>
    apiFetch<TtsVoiceDTO[]>(`/tts/voices?provider=${encodeURIComponent(provider)}`),

  listCredentials: () => apiFetch<CredentialDTO[]>("/credentials"),
  createCredential: (input: CreateCredentialInput) =>
    apiFetch<CredentialDTO>("/credentials", { method: "POST", body: JSON.stringify(input) }),
  deleteCredential: (id: string) => apiFetch<void>(`/credentials/${id}`, { method: "DELETE" }),

  getSettings: () => apiFetch<SettingsDTO>("/settings"),
  updateSettings: (patch: PatchSettingsInput) =>
    apiFetch<SettingsDTO>("/settings", { method: "PATCH", body: JSON.stringify(patch) }),
};
