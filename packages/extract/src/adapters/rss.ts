import Parser from "rss-parser";
import type { RawItem } from "@distill/shared";
import { DEFAULT_MAX_BYTES, readCapped, safeFetch } from "../net/safe-fetch.js";
import { discoverFeed } from "../discover.js";
import type { PollableFeed, SourceAdapter } from "./types.js";

// rss-parser's base Item type omits `id`/`author`, which its own Atom
// normalization can still populate on the parsed object at runtime.
type RssParserItem = Parser.Item & { contentEncoded?: string; id?: string; author?: string };

const parser = new Parser<unknown, RssParserItem>({
  customFields: {
    item: [["content:encoded", "contentEncoded"]],
  },
});

function toRawItem(item: RssParserItem): RawItem | null {
  const url = item.link;
  const guid = item.guid || item.id || url;
  if (!url || !guid) return null;
  return {
    guid,
    url,
    title: item.title?.trim() || url,
    author: item.creator || item.author || null,
    publishedAt: item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : null,
    contentHtml: item.contentEncoded || item.content || null,
  };
}

async function fetchRssItems(feed: PollableFeed): Promise<RawItem[]> {
  const response = await safeFetch(feed.feedUrl);
  if (!response.ok) {
    throw new Error(`Feed fetch failed (${response.status}): ${feed.feedUrl}`);
  }
  const buf = await readCapped(response, DEFAULT_MAX_BYTES);
  const parsed = await parser.parseString(buf.toString("utf-8"));

  const items: RawItem[] = [];
  for (const item of parsed.items) {
    const raw = toRawItem(item);
    if (raw) items.push(raw);
  }
  return items;
}

// rss-parser normalizes both RSS and Atom into the same item shape, so one
// implementation backs both kinds (PLAN §5.2).
export const rssAdapter: SourceAdapter = {
  kind: "rss",
  discover: discoverFeed,
  fetchItems: fetchRssItems,
};

export const atomAdapter: SourceAdapter = {
  kind: "atom",
  discover: discoverFeed,
  fetchItems: fetchRssItems,
};
