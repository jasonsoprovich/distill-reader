// PLAN §8.4 — pure helpers for the RSVP speed-reader. Kept dependency-free
// and DOM-free so both the reader module and its tests can consume them
// directly without any browser environment.

export function tokenizeForRsvp(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

// Optimal Recognition Point (Spritz-style): the character index within a
// word to visually pivot on, so the eye can stay fixed while words change
// under it. Longer words pivot slightly further from the start.
export function computeOrpIndex(word: string): number {
  const len = word.length;
  if (len <= 1) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  if (len <= 13) return 3;
  return 4;
}

const SENTENCE_END_RE = /[.!?…]["')\]]*$/;
const CLAUSE_END_RE = /[,;:—–]["')\]]*$/;

export function endsSentence(word: string): boolean {
  return SENTENCE_END_RE.test(word);
}

export function endsClause(word: string): boolean {
  return !endsSentence(word) && CLAUSE_END_RE.test(word);
}

const LONG_WORD_THRESHOLD = 9;

// Multiplier applied to the base per-word delay (derived from WPM) so long
// words and sentence/clause boundaries get extra dwell time.
export function wordDelayMultiplier(word: string, punctuationPauseEnabled: boolean): number {
  let multiplier = 1;
  if (word.length > LONG_WORD_THRESHOLD) {
    multiplier += 0.15 * (word.length - LONG_WORD_THRESHOLD);
  }
  if (punctuationPauseEnabled) {
    if (endsSentence(word)) multiplier += 1.5;
    else if (endsClause(word)) multiplier += 0.6;
  }
  return multiplier;
}
