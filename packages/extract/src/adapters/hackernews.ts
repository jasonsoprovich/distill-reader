import type { RawItem } from "@distill/shared";
import { discoverFeed } from "../discover.js";
import { DEFAULT_MAX_BYTES, readCapped, safeFetch } from "../net/safe-fetch.js";
import type { PollableFeed, SourceAdapter } from "./types.js";

const HN_API_BASE = "https://hacker-news.firebaseio.com/v0";

// Matches the HN front page size — polling more would mean fetching (and
// SSRF-checking) hundreds of individual item URLs every tick.
const MAX_STORIES = 30;

interface HnItem {
  id: number;
  type?: string;
  title?: string;
  url?: string;
  text?: string;
  by?: string;
  time?: number;
  deleted?: boolean;
  dead?: boolean;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await safeFetch(url);
  if (!response.ok) {
    throw new Error(`Hacker News fetch failed (${response.status}): ${url}`);
  }
  const buf = await readCapped(response, DEFAULT_MAX_BYTES);
  return JSON.parse(buf.toString("utf-8")) as T;
}

export function hnDiscussionUrl(id: number): string {
  return `https://news.ycombinator.com/item?id=${id}`;
}

// Exported for unit testing the mapping in isolation from the network
// (PLAN §12). Ask HN / Show HN / text-only posts have no outbound `url`,
// so the item's own discussion page becomes the article URL and its body
// text is passed through directly — the target for extraction is still
// "the linked article" when one exists (PLAN §5.2).
export function toRawItem(item: HnItem): RawItem | null {
  if (item.deleted || item.dead) return null;
  if (item.type !== "story") return null;
  if (!item.title) return null;

  const discussionUrl = hnDiscussionUrl(item.id);

  return {
    guid: String(item.id),
    url: item.url || discussionUrl,
    title: item.title.trim(),
    author: item.by ?? null,
    publishedAt: item.time ? new Date(item.time * 1000) : null,
    contentHtml: item.url ? null : (item.text ?? null),
    discussionUrl,
  };
}

async function fetchHackerNewsItems(_feed: PollableFeed): Promise<RawItem[]> {
  const ids = await fetchJson<number[]>(`${HN_API_BASE}/topstories.json`);

  const items: RawItem[] = [];
  for (const id of ids.slice(0, MAX_STORIES)) {
    let hnItem: HnItem;
    try {
      hnItem = await fetchJson<HnItem>(`${HN_API_BASE}/item/${id}.json`);
    } catch {
      continue;
    }
    const raw = toRawItem(hnItem);
    if (raw) items.push(raw);
  }
  return items;
}

export const hackerNewsAdapter: SourceAdapter = {
  kind: "api_hackernews",
  discover: discoverFeed,
  fetchItems: fetchHackerNewsItems,
};
