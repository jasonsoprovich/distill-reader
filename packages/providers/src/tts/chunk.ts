// A terminator (., !, ?) followed by whitespace and what looks like the
// start of a new sentence. Deliberately a pragmatic heuristic, not a full
// NLP sentence splitter — it doesn't special-case abbreviations ("Mr.",
// "e.g.") or decimals, so it'll occasionally split somewhere a human
// wouldn't. That's still a strict improvement over the old behavior (an
// exact-character slice with no boundary awareness at all, PLAN §7.2's
// original chunker via summary/chunk.ts's chunkText), which routinely cut a
// chunk off mid-word and handed the TTS provider half a token to pronounce.
const SENTENCE_BOUNDARY_RE = /(?<=[.!?])\s+(?=[A-Z0-9"'“(])/;

function hardSliceChars(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) chunks.push(text.slice(i, i + maxChars));
  return chunks;
}

// Packs already-split units (paragraphs, sentences, or words) into chunks no
// longer than maxChars, joining consecutive units with `join`. A single unit
// that's already over maxChars on its own is handed to `splitOversized` to
// break down further (paragraph -> sentences -> words -> raw chars, in that
// order — see chunkTextForTts below), so the boundary only gets coarser than
// "word" when nothing finer fits.
function pack(units: string[], maxChars: number, join: string, splitOversized: (unit: string) => string[]): string[] {
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.length > 0) chunks.push(current);
    current = "";
  };

  for (const unit of units) {
    if (unit.length > maxChars) {
      flush();
      chunks.push(...splitOversized(unit));
      continue;
    }
    const candidate = current ? `${current}${join}${unit}` : unit;
    if (candidate.length > maxChars) {
      flush();
      current = unit;
    } else {
      current = candidate;
    }
  }
  flush();

  return chunks;
}

function splitByWord(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  return pack(words, maxChars, " ", (word) => hardSliceChars(word, maxChars));
}

function splitBySentence(paragraph: string, maxChars: number): string[] {
  const sentences = paragraph.split(SENTENCE_BOUNDARY_RE).filter((s) => s.length > 0);
  return pack(sentences, maxChars, " ", (sentence) => splitByWord(sentence, maxChars));
}

/**
 * Splits `text` into chunks no larger than `maxChars` for TTS synthesis,
 * preferring paragraph, then sentence, then word boundaries — in that
 * order — over a raw character cut, so a chunk boundary only ever lands
 * mid-word when a single word alone exceeds maxChars (e.g. a long URL).
 * Chunk length varies per chunk (up to maxChars) rather than landing on it
 * exactly, since it's picked by wherever the nearest usable boundary falls.
 */
export function chunkTextForTts(text: string, maxChars: number): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return pack(paragraphs, maxChars, "\n\n", (paragraph) => splitBySentence(paragraph, maxChars));
}
