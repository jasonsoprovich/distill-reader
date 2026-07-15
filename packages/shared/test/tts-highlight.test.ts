import { describe, expect, it } from "vitest";
import { buildHighlightWords, findActiveWordIndex } from "../src/tts-highlight.js";
import type { TtsTimings } from "../src/types.js";

function makeTimings(text: string, secondsPerChar = 0.1): TtsTimings {
  const characters = [...text];
  return {
    characters,
    characterStartTimesSeconds: characters.map((_, i) => i * secondsPerChar),
    characterEndTimesSeconds: characters.map((_, i) => (i + 1) * secondsPerChar),
  };
}

describe("buildHighlightWords", () => {
  it("splits into words with correct start/end windows", () => {
    const timings = makeTimings("Hi there");
    const words = buildHighlightWords(timings);
    expect(words.map((w) => w.text)).toEqual(["Hi", "there"]);
    // "Hi" occupies characters 0-1 (0.0-0.2s)
    expect(words[0].startSeconds).toBeCloseTo(0, 5);
    expect(words[0].endSeconds).toBeCloseTo(0.2, 5);
    // "there" occupies characters 3-7 (0.3-0.8s), after the space at index 2
    expect(words[1].startSeconds).toBeCloseTo(0.3, 5);
    expect(words[1].endSeconds).toBeCloseTo(0.8, 5);
  });

  it("collapses multiple whitespace characters between words", () => {
    const words = buildHighlightWords(makeTimings("a   b\n\nc"));
    expect(words.map((w) => w.text)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array for all-whitespace input", () => {
    expect(buildHighlightWords(makeTimings("   \n\t "))).toEqual([]);
  });

  it("handles a single word with no whitespace", () => {
    const words = buildHighlightWords(makeTimings("hello"));
    expect(words).toHaveLength(1);
    expect(words[0].text).toBe("hello");
    expect(words[0].startSeconds).toBeCloseTo(0, 5);
    expect(words[0].endSeconds).toBeCloseTo(0.5, 5);
  });
});

describe("findActiveWordIndex", () => {
  const words = buildHighlightWords(makeTimings("one two three", 0.1));
  // "one" 0.0-0.3, "two" 0.4-0.7, "three" 0.8-1.3

  it("returns -1 before the first word starts", () => {
    expect(findActiveWordIndex(words, -0.1)).toBe(-1);
  });

  it("returns the word whose start time has just passed", () => {
    expect(findActiveWordIndex(words, 0)).toBe(0);
    expect(findActiveWordIndex(words, 0.35)).toBe(0);
    expect(findActiveWordIndex(words, 0.4)).toBe(1);
    expect(findActiveWordIndex(words, 0.75)).toBe(1);
    expect(findActiveWordIndex(words, 0.8)).toBe(2);
  });

  it("stays on the last word once playback is past the final word's start", () => {
    expect(findActiveWordIndex(words, 100)).toBe(words.length - 1);
  });

  it("returns -1 for an empty word list", () => {
    expect(findActiveWordIndex([], 5)).toBe(-1);
  });
});
