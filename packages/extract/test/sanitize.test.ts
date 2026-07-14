import { beforeAll, describe, expect, it } from "vitest";
import { sanitizeArticleHtml } from "../src/sanitize.js";

const BASE_URL = "https://example.com/article";

describe("sanitizeArticleHtml", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    process.env.BETTER_AUTH_URL = "http://localhost:3001";
  });

  it("strips script tags and their contents", () => {
    const out = sanitizeArticleHtml("<p>hi</p><script>alert(1)</script>", BASE_URL);
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
  });

  it("strips inline event handlers", () => {
    const out = sanitizeArticleHtml('<p onclick="alert(1)">hi</p>', BASE_URL);
    expect(out).not.toContain("onclick");
  });

  it("strips javascript: hrefs", () => {
    const out = sanitizeArticleHtml('<a href="javascript:alert(1)">click</a>', BASE_URL);
    expect(out).not.toContain("javascript:");
  });

  it("strips data: image sources rather than proxying them", () => {
    const out = sanitizeArticleHtml('<img src="data:image/png;base64,AAAA">', BASE_URL);
    expect(out).not.toContain("data:image");
  });

  it("drops iframes entirely", () => {
    const out = sanitizeArticleHtml('<iframe src="https://evil.example/"></iframe>', BASE_URL);
    expect(out).not.toContain("<iframe");
  });

  it("hardens external links with target and rel", () => {
    const out = sanitizeArticleHtml('<a href="https://other.example/">link</a>', BASE_URL);
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("resolves relative links against the article's base URL", () => {
    const out = sanitizeArticleHtml('<a href="/foo">link</a>', BASE_URL);
    expect(out).toContain('href="https://example.com/foo"');
  });

  it("rewrites image src through the signed image proxy, not the original host", () => {
    const out = sanitizeArticleHtml('<img src="https://cdn.example/pic.jpg" alt="pic">', BASE_URL);
    expect(out).toContain("http://localhost:3001/img?u=");
    expect(out).not.toContain("cdn.example");
  });

  it("drops images with no resolvable src", () => {
    const out = sanitizeArticleHtml("<img>", BASE_URL);
    expect(out).not.toContain("<img");
  });

  it("drops tags outside the allowlist while keeping their text", () => {
    const out = sanitizeArticleHtml("<marquee>hi</marquee>", BASE_URL);
    expect(out).not.toContain("<marquee");
    expect(out).toContain("hi");
  });
});
