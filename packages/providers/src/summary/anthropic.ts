import { readCapped, safeFetch } from "@distill/extract";
import { classifyStatus, isTimeoutError } from "./http.js";
import { SUMMARY_REQUEST_TIMEOUT_MS } from "./models.js";
import { SummaryProviderError, type SummaryClientRequest, type SummaryClientResult, type SummaryProviderClient } from "./types.js";

interface AnthropicMessagesResponse {
  content?: { type: string; text?: string }[];
}

const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 1024;

export function createAnthropicClient(apiKey: string, baseUrl?: string | null): SummaryProviderClient {
  const root = (baseUrl || "https://api.anthropic.com/v1").replace(/\/$/, "");

  return {
    provider: "anthropic",
    async complete({ systemPrompt, userContent, model }: SummaryClientRequest): Promise<SummaryClientResult> {
      let response: Response;
      try {
        // baseUrl is user-settable, so it goes through the same
        // SSRF-checked fetcher as every other user-supplied URL in this
        // codebase (PLAN §10.2), not a bare fetch.
        response = await safeFetch(`${root}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          timeoutMs: SUMMARY_REQUEST_TIMEOUT_MS,
          body: JSON.stringify({
            model,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            messages: [{ role: "user", content: userContent }],
          }),
        });
      } catch (err) {
        if (isTimeoutError(err)) throw new SummaryProviderError("anthropic", "timeout", "Anthropic request timed out");
        throw new SummaryProviderError(
          "anthropic",
          "unknown",
          err instanceof Error ? err.message : "Anthropic request failed",
        );
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new SummaryProviderError(
          "anthropic",
          classifyStatus(response.status),
          `Anthropic request failed (${response.status}): ${body.slice(0, 300)}`,
        );
      }

      const buf = await readCapped(response);
      const data = JSON.parse(buf.toString("utf-8")) as AnthropicMessagesResponse;
      const content = data.content
        ?.filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("")
        .trim();
      if (!content) throw new SummaryProviderError("anthropic", "empty_response", "Anthropic returned an empty summary");
      return { content, model };
    },
  };
}
