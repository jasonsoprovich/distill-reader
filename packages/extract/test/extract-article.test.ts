import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractFromHtml } from "../src/extract-article.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(path.join(__dirname, "fixtures", "sample-article.html"), "utf-8");

describe("extractFromHtml", () => {
  it("extracts clean, ad-free content from a saved article fixture", () => {
    const result = extractFromHtml(fixtureHtml, "https://example.com/security-news/sample-article");

    expect(result.extractionStatus).toBe("ok");
    expect(result.contentText.length).toBeGreaterThan(400);
    expect(result.wordCount).toBeGreaterThan(80);

    // Nav/ad/footer cruft must not survive extraction.
    expect(result.contentText).not.toMatch(/advertisement/i);
    expect(result.contentText).not.toMatch(/subscribe to our newsletter/i);
    expect(result.contentHtml).not.toContain("<script");
    expect(result.contentHtml).not.toContain("<nav");
    expect(result.contentHtml).not.toContain("ad-slot");

    // Article body content is present.
    expect(result.contentText).toMatch(/ransomware/i);
    expect(result.leadImageUrl).toBe("https://example.com/images/vpn-flaw-hero.jpg");
  });

  it("returns a failed status for content too thin to be a real article", () => {
    const result = extractFromHtml("<html><body><p>too short</p></body></html>", "https://example.com/x");
    expect(result.extractionStatus).toBe("failed");
  });
});
