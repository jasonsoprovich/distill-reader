import { describe, expect, it } from "vitest";
import { chunkText } from "../src/summary/chunk.js";

describe("chunkText", () => {
  it("returns a single chunk when text fits under maxChars", () => {
    const text = "Paragraph one.\n\nParagraph two.";
    expect(chunkText(text, 1000)).toEqual([text]);
  });

  it("splits on paragraph boundaries once maxChars is exceeded", () => {
    const a = "a".repeat(50);
    const b = "b".repeat(50);
    const c = "c".repeat(50);
    const chunks = chunkText([a, b, c].join("\n\n"), 80);
    expect(chunks).toEqual([a, b, c]);
  });

  it("packs multiple short paragraphs into one chunk", () => {
    const chunks = chunkText(["short one", "short two", "short three"].join("\n\n"), 100);
    expect(chunks).toEqual(["short one\n\nshort two\n\nshort three"]);
  });

  it("hard-splits a single paragraph longer than maxChars", () => {
    const long = "x".repeat(250);
    const chunks = chunkText(long, 100);
    expect(chunks).toEqual([long.slice(0, 100), long.slice(100, 200), long.slice(200)]);
  });

  it("drops empty paragraphs", () => {
    expect(chunkText("a\n\n\n\nb", 1000)).toEqual(["a\n\nb"]);
  });
});
