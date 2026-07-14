import type { DiscoveredFeed, FeedKind, RawItem } from "@distill/shared";

// A feed row is exactly what a SourceAdapter needs to poll: the resolved
// feed endpoint plus its kind. Defined structurally so callers can pass
// either the db `feed` row or a lighter object without an extract->db
// dependency.
export interface PollableFeed {
  feedUrl: string;
  sourceUrl: string;
  title: string;
}

export interface SourceAdapter {
  kind: FeedKind;
  discover(url: string): Promise<DiscoveredFeed | null>;
  fetchItems(feed: PollableFeed): Promise<RawItem[]>;
}
