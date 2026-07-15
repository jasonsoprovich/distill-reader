import { describe, expect, it } from "vitest";
import {
  computeOrpIndex,
  endsClause,
  endsSentence,
  tokenizeForRsvp,
  wordDelayMultiplier,
} from "../src/rsvp.js";

describe("computeOrpIndex", () => {
  it("pivots on the first character for single-letter words", () => {
    expect(computeOrpIndex("a")).toBe(0);
    expect(computeOrpIndex("I")).toBe(0);
  });

  it("increases the pivot as word length grows", () => {
    expect(computeOrpIndex("cat")).toBe(1); // len 3, <=5
    expect(computeOrpIndex("planet")).toBe(2); // len 6, <=9
    expect(computeOrpIndex("wonderful")).toBe(2); // len 9, <=9
    expect(computeOrpIndex("fascinate")).toBe(2);
    expect(computeOrpIndex("incredible")).toBe(3); // len 10, <=13
    expect(computeOrpIndex("extraordinary")).toBe(3); // len 13, <=13
    expect(computeOrpIndex("counterintuitive")).toBe(4); // len 16, >13
  });

  it("never returns an index past the word's own length", () => {
    for (const word of ["a", "to", "the", "quick", "brown", "jumped", "extraordinarily"]) {
      expect(computeOrpIndex(word)).toBeLessThan(word.length || 1);
    }
  });
});

describe("tokenizeForRsvp", () => {
  it("splits on whitespace and drops empty tokens", () => {
    expect(tokenizeForRsvp("  The  quick brown\nfox\tjumps. ")).toEqual([
      "The",
      "quick",
      "brown",
      "fox",
      "jumps.",
    ]);
  });

  it("returns an empty array for blank input", () => {
    expect(tokenizeForRsvp("   \n\t ")).toEqual([]);
  });
});

describe("endsSentence / endsClause", () => {
  it("detects sentence-ending punctuation, including trailing quotes/brackets", () => {
    expect(endsSentence("done.")).toBe(true);
    expect(endsSentence("really?")).toBe(true);
    expect(endsSentence('quoted."')).toBe(true);
    expect(endsSentence("word")).toBe(false);
  });

  it("detects clause-ending punctuation but not when it's actually sentence-ending", () => {
    expect(endsClause("however,")).toBe(true);
    expect(endsClause("done.")).toBe(false);
    expect(endsClause("word")).toBe(false);
  });
});

describe("wordDelayMultiplier", () => {
  it("is 1 for a short word with punctuation pauses disabled", () => {
    expect(wordDelayMultiplier("cat", false)).toBe(1);
  });

  it("slows down long words regardless of punctuation setting", () => {
    expect(wordDelayMultiplier("extraordinarily", false)).toBeGreaterThan(1);
  });

  it("adds extra pause for sentence endings only when enabled", () => {
    const withPause = wordDelayMultiplier("done.", true);
    const withoutPause = wordDelayMultiplier("done.", false);
    expect(withPause).toBeGreaterThan(withoutPause);
  });

  it("pauses more for a sentence end than a clause end", () => {
    expect(wordDelayMultiplier("done.", true)).toBeGreaterThan(wordDelayMultiplier("however,", true));
  });
});
