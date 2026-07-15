import type { TtsTimings } from "./types.js";

// PLAN §7.3 — pure helpers for TTS highlight-follow. Kept dependency-free
// and DOM-free (mirrors rsvp.ts) so the player and its tests can consume
// them directly without a browser environment.
//
// The transcript is built from `timings.characters.join("")` itself, not
// from `article.contentText`: long articles are chunked before synthesis
// (packages/providers/src/tts/index.ts), and chunkText trims each chunk's
// boundaries, so the concatenated per-chunk text isn't guaranteed
// character-for-character identical to the original contentText at chunk
// boundaries. The timings ARE exact for whatever text was actually
// synthesized, so reconstructing from them guarantees the highlight never
// drifts out of sync with the audio, at the cost of not literally being
// the reader's rendered article body.

export interface HighlightWord {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

const WHITESPACE_RE = /\s/;

/** Groups a timings' per-character alignment into per-word start/end windows. */
export function buildHighlightWords(timings: TtsTimings): HighlightWord[] {
  const { characters, characterStartTimesSeconds, characterEndTimesSeconds } = timings;
  const words: HighlightWord[] = [];

  let i = 0;
  while (i < characters.length) {
    while (i < characters.length && WHITESPACE_RE.test(characters[i])) i++;
    if (i >= characters.length) break;

    const start = i;
    while (i < characters.length && !WHITESPACE_RE.test(characters[i])) i++;
    const end = i; // exclusive

    words.push({
      text: characters.slice(start, end).join(""),
      startSeconds: characterStartTimesSeconds[start],
      endSeconds: characterEndTimesSeconds[end - 1],
    });
  }

  return words;
}

/**
 * Returns the index of the word currently being spoken at `currentTimeSeconds`
 * — the last word whose start time has passed — or -1 before the first word
 * starts. Binary search since `words` is time-ordered by construction.
 */
export function findActiveWordIndex(words: HighlightWord[], currentTimeSeconds: number): number {
  let lo = 0;
  let hi = words.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].startSeconds <= currentTimeSeconds) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result;
}
