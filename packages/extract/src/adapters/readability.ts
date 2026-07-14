import type { RawItem } from "@distill/shared";
import { discoverFeed } from "../discover.js";
import type { PollableFeed, SourceAdapter } from "./types.js";

// No feed exists for these sources (PLAN §5.2) — the page itself is the
// single item. Its guid is the URL, so re-polling never re-inserts it;
// full-text extraction happens uniformly in ingest.ts via extractArticle().
export const readabilityAdapter: SourceAdapter = {
  kind: "readability",
  discover: discoverFeed,
  async fetchItems(feed: PollableFeed): Promise<RawItem[]> {
    return [
      {
        guid: feed.sourceUrl,
        url: feed.sourceUrl,
        title: feed.title,
        author: null,
        publishedAt: null,
        contentHtml: null,
      },
    ];
  },
};
