import { readCapped, safeFetch } from "@distill/extract";
import { isTimeoutError } from "./http.js";
import { SUMMARY_REQUEST_TIMEOUT_MS } from "./models.js";
import { SummaryProviderError, type SummaryClientRequest, type SummaryClientResult, type SummaryProviderClient } from "./types.js";

interface OllamaChatResponse {
  message?: { content?: string };
}

// Ollama's base_url is a self-hosted sidecar address, often on a private
// network — allowlisted through safeFetch's SSRF check as a deliberate,
// configured exception (PLAN §10.2), same pattern as Piper. Trust both the
// deploy operator's OLLAMA_BASE_URL env var *and* the requesting user's own
// stored credential.baseUrl: in this single-user app only the account owner
// can set that credential (via Settings), so it carries the same trust as
// the env var — and trusting it directly avoids requiring the two
// independently-typed values to match hostname-for-hostname before requests
// work (see the Piper fix for the same issue).
function trustedOllamaHosts(root: string): string[] {
  const hosts = new Set<string>();
  const configured = process.env.OLLAMA_BASE_URL;
  if (configured) {
    try {
      hosts.add(new URL(configured).hostname);
    } catch {
      // ignore malformed env var
    }
  }
  try {
    hosts.add(new URL(root).hostname);
  } catch {
    // ignore malformed root; safeFetch's own URL parsing will surface the error
  }
  return [...hosts];
}

export function createOllamaClient(baseUrl: string): SummaryProviderClient {
  const root = baseUrl.replace(/\/$/, "");

  return {
    provider: "ollama",
    async complete({ systemPrompt, userContent, model }: SummaryClientRequest): Promise<SummaryClientResult> {
      let response: Response;
      try {
        response = await safeFetch(`${root}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          timeoutMs: SUMMARY_REQUEST_TIMEOUT_MS,
          allowedHosts: trustedOllamaHosts(root),
          body: JSON.stringify({
            model,
            stream: false,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent },
            ],
          }),
        });
      } catch (err) {
        if (isTimeoutError(err)) throw new SummaryProviderError("ollama", "timeout", "Ollama request timed out");
        throw new SummaryProviderError("ollama", "unknown", err instanceof Error ? err.message : "Ollama request failed");
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new SummaryProviderError(
          "ollama",
          "unknown",
          `Ollama request failed (${response.status}): ${body.slice(0, 300)}`,
        );
      }

      const buf = await readCapped(response);
      const data = JSON.parse(buf.toString("utf-8")) as OllamaChatResponse;
      const content = data.message?.content?.trim();
      if (!content) throw new SummaryProviderError("ollama", "empty_response", "Ollama returned an empty summary");
      return { content, model };
    },
  };
}
