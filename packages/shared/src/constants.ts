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

// Preseed set (PLAN §5.5).
export const PRESEED_SOURCES: PreseedSource[] = [
  { name: "The Hacker News", url: "https://thehackernews.com" },
  { name: "Hacker News (YC)", url: "https://news.ycombinator.com" },
  { name: "Krebs on Security", url: "https://krebsonsecurity.com" },
  { name: "Dark Reading", url: "https://www.darkreading.com" },
  { name: "BleepingComputer", url: "https://www.bleepingcomputer.com" },
];
