import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import type { ExtractedArticle } from "@distill/shared";
import { readCapped, safeFetch } from "./net/safe-fetch.js";

const MAX_ARTICLE_BYTES = 8 * 1024 * 1024;
const MIN_OK_CHARS = 400;
const MIN_PARTIAL_CHARS = 50;

const EMPTY_FAILED: ExtractedArticle = {
  contentHtml: "",
  contentText: "",
  excerpt: null,
  leadImageUrl: null,
  wordCount: 0,
  extractionStatus: "failed",
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function findLeadImage(doc: Document): string | null {
  const og = doc.querySelector('meta[property="og:image"]')?.getAttribute("content");
  if (og) return og;
  return doc.querySelector('meta[name="twitter:image"]')?.getAttribute("content") ?? null;
}

/**
 * Runs Mozilla Readability over already-fetched HTML (PLAN §5.3). Split out
 * from extractArticle() so it can be unit-tested against saved fixtures
 * without a network fetch. Returned `contentHtml` is pre-sanitize — callers
 * must run it through sanitizeArticleHtml() before storing or rendering it.
 */
export function extractFromHtml(html: string, url: string): ExtractedArticle {
  try {
    const dom = new JSDOM(html, { url });
    const leadImageUrl = findLeadImage(dom.window.document);

    const documentClone = dom.window.document.cloneNode(true) as Document;
    const article = new Readability(documentClone).parse();
    if (!article?.content) return { ...EMPTY_FAILED, leadImageUrl };

    const contentText = article.textContent?.trim() ?? "";
    const wordCount = countWords(contentText);
    const extractionStatus =
      contentText.length >= MIN_OK_CHARS
        ? "ok"
        : contentText.length >= MIN_PARTIAL_CHARS
          ? "partial"
          : "failed";

    return {
      contentHtml: article.content,
      contentText,
      excerpt: article.excerpt?.trim() || null,
      leadImageUrl,
      wordCount,
      extractionStatus,
    };
  } catch {
    return EMPTY_FAILED;
  }
}

/**
 * Fetches `url` and runs extractFromHtml() to derive the clean article body.
 * Never throws: network/parse failures produce extractionStatus:"failed"
 * with empty content so ingest.ts can still store a stub row and the UI
 * can offer "open original".
 */
export async function extractArticle(url: string): Promise<ExtractedArticle> {
  let html: string;
  try {
    const response = await safeFetch(url);
    if (!response.ok) return EMPTY_FAILED;
    html = (await readCapped(response, MAX_ARTICLE_BYTES)).toString("utf-8");
  } catch {
    return EMPTY_FAILED;
  }

  return extractFromHtml(html, url);
}
