import { readCapped, safeFetch } from "@distill/extract";
import { isTimeoutError } from "./http.js";
import { SUMMARY_REQUEST_TIMEOUT_MS } from "./models.js";
import { SummaryProviderError, type SummaryClientRequest, type SummaryClientResult, type SummaryProviderClient } from "./types.js";

interface OllamaChatResponse {
  message?: { content?: string };
}

// Ollama's base_url is a self-hosted sidecar address, often on a private
// network — allowlisted through safeFetch's SSRF check only when it matches
// the deploy operator's configured OLLAMA_BASE_URL (PLAN §10.2's "deliberate,
// configured exception"), not whatever a credential row happens to contain.
function trustedOllamaHosts(): string[] {
  const configured = process.env.OLLAMA_BASE_URL;
  if (!configured) return [];
  try {
    return [new URL(configured).hostname];
  } catch {
    return [];
  }
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
          allowedHosts: trustedOllamaHosts(),
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
