import { describe, expect, it } from "vitest";
import { chunkTextForTts } from "../src/tts/chunk.js";

describe("chunkTextForTts", () => {
  it("returns a single chunk when text fits under maxChars", () => {
    const text = "Sentence one. Sentence two.";
    expect(chunkTextForTts(text, 1000)).toEqual([text]);
  });

  it("splits on sentence boundaries when a single paragraph has no blank-line breaks", () => {
    // Summaries and extracted article text routinely arrive as one flowing
    // paragraph with no \n\n at all — this is the case that used to fall
    // straight into an exact-character hard slice.
    const text = "This is the first sentence. This is the second sentence. This is the third sentence.";
    const chunks = chunkTextForTts(text, 40);
    expect(chunks).toEqual([
      "This is the first sentence.",
      "This is the second sentence.",
      "This is the third sentence.",
    ]);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(40);
      // No chunk boundary lands mid-word.
      expect(chunk.trimEnd()).not.toMatch(/[a-zA-Z]-$/);
      expect(chunks.join(" ")).not.toContain("  ");
    }
  });

  it("packs multiple short sentences into one chunk rather than one-per-chunk", () => {
    const text = "Short one. Short two. Short three.";
    expect(chunkTextForTts(text, 1000)).toEqual([text]);
  });

  it("falls back to word boundaries when a single sentence exceeds maxChars", () => {
    const text = "one two three four five six seven eight nine ten eleven twelve.";
    const chunks = chunkTextForTts(text, 20);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(20);
    }
    // Every original word survives intact across the rejoined chunks.
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(text);
  });

  it("still hard-splits a single unbroken run longer than maxChars (no sentence or word boundary exists)", () => {
    const long = "x".repeat(250);
    const chunks = chunkTextForTts(long, 100);
    expect(chunks).toEqual([long.slice(0, 100), long.slice(100, 200), long.slice(200)]);
  });

  it("still respects paragraph breaks first, same as the summary chunker", () => {
    const a = "Paragraph one.";
    const b = "Paragraph two.";
    const chunks = chunkTextForTts([a, b].join("\n\n"), 1000);
    expect(chunks).toEqual([[a, b].join("\n\n")]);
  });

  it("drops empty paragraphs", () => {
    expect(chunkTextForTts("a\n\n\n\nb", 1000)).toEqual(["a\n\nb"]);
  });
});
