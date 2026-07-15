// Bump whenever SUMMARY_SYSTEM_PROMPT (or the map/reduce prompts below)
// changes meaningfully — it's part of the `summary` table's cache key
// (PLAN §6.2), so a bump invalidates stale cached summaries instead of
// serving them under the new prompt's implied format.
export const SUMMARY_PROMPT_VERSION = "v1";

// Kept identical across providers (PLAN §6.3) so the reader UI can render
// every provider's output the same way.
export const SUMMARY_SYSTEM_PROMPT = `You summarize security/tech news articles for a reader. Produce, in plain text (no markdown headers):

1. A 2-3 sentence TL;DR.
2. Key points as short "- " bulleted lines.
3. If the article names any CVEs, affected products, or indicators of compromise (IOCs), list them under a final "IOCs & CVEs:" line as short bullets. Omit this section entirely if none are present.

Be concise and factual. Do not invent details not present in the article.`;

const MAP_SYSTEM_PROMPT = `Extract the key facts, named CVEs, affected products, and IOCs from this excerpt of a longer article. Plain text, short bullet points, no commentary.`;

export function buildUserContent(title: string, text: string): string {
  return `Title: ${title}\n\n${text}`;
}

export function buildMapPrompt(): string {
  return MAP_SYSTEM_PROMPT;
}

export function buildReduceUserContent(title: string, chunkSummaries: string[]): string {
  const joined = chunkSummaries.map((s, i) => `[Part ${i + 1}]\n${s}`).join("\n\n");
  return `Title: ${title}\n\nThe article was split into parts and summarized separately below. Produce one unified summary in the required format from these part-summaries:\n\n${joined}`;
}
