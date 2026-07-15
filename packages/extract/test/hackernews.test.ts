import { describe, expect, it } from "vitest";
import { hnDiscussionUrl, toRawItem } from "../src/adapters/hackernews.js";

describe("toRawItem", () => {
  it("maps a link story to the outbound URL, keeping the discussion URL as metadata", () => {
    const item = toRawItem({
      id: 42,
      type: "story",
      title: "  Some Security Thing  ",
      url: "https://example.com/article",
      by: "alice",
      time: 1_700_000_000,
    });

    expect(item).toEqual({
      guid: "42",
      url: "https://example.com/article",
      title: "Some Security Thing",
      author: "alice",
      publishedAt: new Date(1_700_000_000 * 1000),
      contentHtml: null,
      discussionUrl: hnDiscussionUrl(42),
    });
  });

  it("uses the discussion page and inline text for a text-only Ask HN post", () => {
    const item = toRawItem({
      id: 99,
      type: "story",
      title: "Ask HN: What are you working on?",
      text: "<p>Tell us what you're building.</p>",
      by: "bob",
      time: 1_700_000_000,
    });

    expect(item?.url).toBe(hnDiscussionUrl(99));
    expect(item?.discussionUrl).toBe(hnDiscussionUrl(99));
    expect(item?.contentHtml).toBe("<p>Tell us what you're building.</p>");
  });

  it("skips deleted and dead items", () => {
    expect(toRawItem({ id: 1, type: "story", title: "x", deleted: true })).toBeNull();
    expect(toRawItem({ id: 2, type: "story", title: "x", dead: true })).toBeNull();
  });

  it("skips non-story items (jobs, polls, comments)", () => {
    expect(toRawItem({ id: 3, type: "job", title: "We're hiring" })).toBeNull();
    expect(toRawItem({ id: 4, type: "comment", title: "irrelevant" })).toBeNull();
  });

  it("skips items with no title", () => {
    expect(toRawItem({ id: 5, type: "story" })).toBeNull();
  });

  it("falls back to null author and publishedAt when absent", () => {
    const item = toRawItem({ id: 6, type: "story", title: "No metadata", url: "https://example.com/x" });
    expect(item?.author).toBeNull();
    expect(item?.publishedAt).toBeNull();
  });
});
