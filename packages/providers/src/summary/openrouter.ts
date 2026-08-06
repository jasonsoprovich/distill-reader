import { readCapped, safeFetch } from "@distill/extract";
import { OPENROUTER_BASE_URL } from "@distill/shared";
import { classifyStatus, isTimeoutError } from "./http.js";
import { SUMMARY_REQUEST_TIMEOUT_MS } from "./models.js";
import { SummaryProviderError, type SummaryClientRequest, type SummaryClientResult, type SummaryProviderClient } from "./types.js";

interface OpenRouterChatResponse {
  choices?: { message?: { content?: string } }[];
}

// OpenRouter's chat completions endpoint is OpenAI-compatible, so this
// mirrors createOpenAiClient (openai.ts) almost exactly — the only
// differences are the fixed root URL and the provider tag on errors.
export function createOpenRouterClient(apiKey: string, baseUrl?: string | null): SummaryProviderClient {
  const root = (baseUrl || OPENROUTER_BASE_URL).replace(/\/$/, "");

  return {
    provider: "openrouter",
    async complete({ systemPrompt, userContent, model }: SummaryClientRequest): Promise<SummaryClientResult> {
      let response: Response;
      try {
        response = await safeFetch(`${root}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          timeoutMs: SUMMARY_REQUEST_TIMEOUT_MS,
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent },
            ],
            temperature: 0.3,
          }),
        });
      } catch (err) {
        if (isTimeoutError(err)) throw new SummaryProviderError("openrouter", "timeout", "OpenRouter request timed out");
        throw new SummaryProviderError("openrouter", "unknown", err instanceof Error ? err.message : "OpenRouter request failed");
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new SummaryProviderError(
          "openrouter",
          classifyStatus(response.status),
          `OpenRouter request failed (${response.status}): ${body.slice(0, 300)}`,
        );
      }

      const buf = await readCapped(response);
      const data = JSON.parse(buf.toString("utf-8")) as OpenRouterChatResponse;
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new SummaryProviderError("openrouter", "empty_response", "OpenRouter returned an empty summary");
      return { content, model };
    },
  };
}
