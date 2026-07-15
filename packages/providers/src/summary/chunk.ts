// Articles under this length go through a single provider call. Past it,
// map-reduce chunking kicks in (PLAN §6.2). ~12k chars is a conservative
// margin under small-context models' comfortable window once the system
// prompt and completion budget are accounted for.
export const MAX_SINGLE_PASS_CHARS = 12_000;

// Per-chunk size for the map phase.
export const MAP_CHUNK_CHARS = 8_000;

/**
 * Splits `text` into chunks no larger than `maxChars`, breaking on
 * paragraph boundaries so sentences are never cut mid-word. A single
 * paragraph longer than `maxChars` is hard-split as a last resort.
 */
export function chunkText(text: string, maxChars: number = MAP_CHUNK_CHARS): string[] {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim().length > 0) chunks.push(current.trim());
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      flush();
      for (let i = 0; i < paragraph.length; i += maxChars) {
        chunks.push(paragraph.slice(i, i + maxChars).trim());
      }
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars) {
      flush();
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  flush();

  return chunks;
}
