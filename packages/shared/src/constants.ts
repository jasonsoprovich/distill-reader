export const APP_NAME = "distill";

export const USER_AGENT = "DistillReader/0.1 (+self-hosted feed reader)";

// Probed in order when a source URL isn't already a feed and has no
// discoverable <link rel="alternate"> tag.
export const FEED_DISCOVERY_PROBE_PATHS = [
  "/feed",
  "/rss",
  "/feed.xml",
  "/atom.xml",
  "/index.xml",
] as const;

export interface PreseedSource {
  name: string;
  url: string;
}

// Phase 2 preseed set (PLAN §5.5). Hacker News is API-adapter-based and is
// preseeded in Phase 4 once that adapter exists.
export const PRESEED_SOURCES: PreseedSource[] = [
  { name: "The Hacker News", url: "https://thehackernews.com" },
  { name: "Krebs on Security", url: "https://krebsonsecurity.com" },
  { name: "Dark Reading", url: "https://www.darkreading.com" },
  { name: "BleepingComputer", url: "https://www.bleepingcomputer.com" },
];
