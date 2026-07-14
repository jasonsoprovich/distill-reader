import { JSDOM } from "jsdom";
import Parser from "rss-parser";
import { FEED_DISCOVERY_PROBE_PATHS, type DiscoveredFeed, type FeedKind } from "@distill/shared";
import { readCapped, safeFetch } from "./net/safe-fetch.js";

const MAX_DISCOVERY_BYTES = 5 * 1024 * 1024;
const rssParser = new Parser();

function isHackerNewsHost(hostname: string): boolean {
  return hostname === "news.ycombinator.com" || hostname.endsWith(".news.ycombinator.com");
}

function sniffFeedKind(xml: string): "rss" | "atom" | null {
  const sample = xml.slice(0, 2000);
  if (/<rss[\s>]/i.test(sample) || /<rdf:rdf[\s>]/i.test(sample)) return "rss";
  if (/<feed[\s>]/i.test(sample)) return "atom";
  return null;
}

type FeedCandidate = Omit<DiscoveredFeed, "sourceUrl">;

async function tryAsFeed(url: string): Promise<FeedCandidate | null> {
  let response: Response;
  try {
    response = await safeFetch(url);
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let text: string;
  try {
    text = (await readCapped(response, MAX_DISCOVERY_BYTES)).toString("utf-8");
  } catch {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const sniffed = sniffFeedKind(text);
  if (!/xml|rss|atom/i.test(contentType) && !sniffed) return null;

  const kind: FeedKind = sniffed ?? "rss";
  try {
    const parsed = await rssParser.parseString(text);
    return {
      feedUrl: url,
      kind,
      title: parsed.title?.trim() || new URL(url).hostname,
      siteUrl: parsed.link ?? null,
      faviconUrl: null,
    };
  } catch {
    return null;
  }
}

interface FetchedHtml {
  doc: Document;
  finalUrl: string;
}

async function fetchHtml(url: string): Promise<FetchedHtml | null> {
  let response: Response;
  try {
    response = await safeFetch(url);
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/html/i.test(contentType)) return null;

  let buf: Buffer;
  try {
    buf = await readCapped(response, MAX_DISCOVERY_BYTES);
  } catch {
    return null;
  }

  const finalUrl = response.url || url;
  const dom = new JSDOM(buf.toString("utf-8"), { url: finalUrl });
  return { doc: dom.window.document, finalUrl };
}

function findAlternateFeedLink(doc: Document, baseUrl: string): string | null {
  const links = doc.querySelectorAll('link[rel="alternate"]');
  for (const link of links) {
    const type = link.getAttribute("type") ?? "";
    if (/application\/(rss|atom)\+xml/i.test(type)) {
      const href = link.getAttribute("href");
      if (href) return new URL(href, baseUrl).toString();
    }
  }
  return null;
}

function extractFavicon(doc: Document, baseUrl: string): string | null {
  const selectors = ['link[rel="icon"]', 'link[rel="shortcut icon"]', 'link[rel="apple-touch-icon"]'];
  for (const selector of selectors) {
    const href = doc.querySelector(selector)?.getAttribute("href");
    if (href) return new URL(href, baseUrl).toString();
  }
  try {
    return new URL("/favicon.ico", baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Feed discovery for the add-feed flow (PLAN §5.1). Caller is responsible
 * for SSRF-validating `inputUrl` before calling — safeFetch() does that for
 * every request this makes, including redirects and probed paths.
 */
export async function discoverFeed(inputUrl: string): Promise<DiscoveredFeed | null> {
  const sourceUrl = new URL(inputUrl).toString();
  const origin = new URL(sourceUrl).origin;

  if (isHackerNewsHost(new URL(sourceUrl).hostname)) {
    return {
      sourceUrl,
      feedUrl: sourceUrl,
      kind: "api_hackernews",
      title: "Hacker News",
      siteUrl: "https://news.ycombinator.com",
      faviconUrl: "https://news.ycombinator.com/favicon.ico",
    };
  }

  const direct = await tryAsFeed(sourceUrl);
  if (direct) {
    return { ...direct, sourceUrl, siteUrl: direct.siteUrl ?? sourceUrl };
  }

  const html = await fetchHtml(sourceUrl);
  if (!html) return null;

  const favicon = extractFavicon(html.doc, html.finalUrl);

  const altHref = findAlternateFeedLink(html.doc, html.finalUrl);
  if (altHref) {
    const viaLink = await tryAsFeed(altHref);
    if (viaLink) {
      return {
        ...viaLink,
        sourceUrl,
        siteUrl: viaLink.siteUrl ?? sourceUrl,
        faviconUrl: viaLink.faviconUrl ?? favicon,
      };
    }
  }

  for (const path of FEED_DISCOVERY_PROBE_PATHS) {
    const probeUrl = new URL(path, origin).toString();
    const probed = await tryAsFeed(probeUrl);
    if (probed) {
      return {
        ...probed,
        sourceUrl,
        siteUrl: probed.siteUrl ?? sourceUrl,
        faviconUrl: probed.faviconUrl ?? favicon,
      };
    }
  }

  const title = html.doc.querySelector("title")?.textContent?.trim() || new URL(sourceUrl).hostname;
  return {
    sourceUrl,
    feedUrl: sourceUrl,
    kind: "readability",
    title,
    siteUrl: sourceUrl,
    faviconUrl: favicon,
  };
}
