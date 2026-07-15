import { readCapped, safeFetch } from "@distill/extract";
import { classifyStatus, isTimeoutError } from "./http.js";
import { SUMMARY_REQUEST_TIMEOUT_MS } from "./models.js";
import { SummaryProviderError, type SummaryClientRequest, type SummaryClientResult, type SummaryProviderClient } from "./types.js";

interface OpenAiChatResponse {
  choices?: { message?: { content?: string } }[];
}

export function createOpenAiClient(apiKey: string, baseUrl?: string | null): SummaryProviderClient {
  const root = (baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");

  return {
    provider: "openai",
    async complete({ systemPrompt, userContent, model }: SummaryClientRequest): Promise<SummaryClientResult> {
      let response: Response;
      try {
        // baseUrl is user-settable (a custom OpenAI-compatible gateway), so
        // it goes through the same SSRF-checked fetcher as every other
        // user-supplied URL in this codebase (PLAN §10.2), not a bare fetch.
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
        if (isTimeoutError(err)) throw new SummaryProviderError("openai", "timeout", "OpenAI request timed out");
        throw new SummaryProviderError("openai", "unknown", err instanceof Error ? err.message : "OpenAI request failed");
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new SummaryProviderError(
          "openai",
          classifyStatus(response.status),
          `OpenAI request failed (${response.status}): ${body.slice(0, 300)}`,
        );
      }

      const buf = await readCapped(response);
      const data = JSON.parse(buf.toString("utf-8")) as OpenAiChatResponse;
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new SummaryProviderError("openai", "empty_response", "OpenAI returned an empty summary");
      return { content, model };
    },
  };
}
