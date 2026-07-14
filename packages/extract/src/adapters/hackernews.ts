import type { RawItem } from "@distill/shared";
import { discoverFeed } from "../discover.js";
import type { PollableFeed, SourceAdapter } from "./types.js";

// Firebase/Algolia item-fetching + Ask/Show/text-post handling is Phase 4
// (PLAN §13). Discovery already recognizes news.ycombinator.com so the
// add-feed preview works; polling a saved HN feed is not wired up yet.
export const hackerNewsAdapter: SourceAdapter = {
  kind: "api_hackernews",
  discover: discoverFeed,
  async fetchItems(_feed: PollableFeed): Promise<RawItem[]> {
    throw new Error("Hacker News polling is not implemented until Phase 4");
  },
};
