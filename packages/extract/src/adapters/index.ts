import type { FeedKind } from "@distill/shared";
import { atomAdapter, rssAdapter } from "./rss.js";
import { readabilityAdapter } from "./readability.js";
import { hackerNewsAdapter } from "./hackernews.js";
import type { SourceAdapter } from "./types.js";

export type { PollableFeed, SourceAdapter } from "./types.js";

export const adaptersByKind: Record<FeedKind, SourceAdapter> = {
  rss: rssAdapter,
  atom: atomAdapter,
  readability: readabilityAdapter,
  api_hackernews: hackerNewsAdapter,
};

export function getAdapter(kind: FeedKind): SourceAdapter {
  return adaptersByKind[kind];
}
