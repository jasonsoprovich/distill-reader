import { readCapped, safeFetch } from "@distill/extract";
import { DEFAULT_OPENROUTER_TTS_MODEL, OPENROUTER_BASE_URL } from "@distill/shared";
import { fetchOpenRouterModels } from "../openrouter-catalog.js";
import { classifyStatus, isTimeoutError } from "./http.js";
import { TTS_REQUEST_TIMEOUT_MS } from "./models.js";
import { TtsProviderError, type TtsSynthesizeRequest, type TtsSynthesizeResult, type TtsProviderClient, type TtsVoiceInfo } from "./types.js";

export function createOpenRouterTtsClient(apiKey: string): TtsProviderClient {
  return {
    provider: "openrouter",
    async synthesize({ text, voice, speed, model }: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
      let response: Response;
      try {
        response = await safeFetch(`${OPENROUTER_BASE_URL}/audio/speech`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          timeoutMs: TTS_REQUEST_TIMEOUT_MS.openrouter,
          body: JSON.stringify({
            model: model || DEFAULT_OPENROUTER_TTS_MODEL,
            input: text,
            voice,
            // OpenRouter's own default is "pcm" (raw samples, not a decodable
            // file) — every other cloud provider here returns mp3, and
            // audio-concat.ts/the player both assume a decodable container.
            response_format: "mp3",
            speed,
          }),
        });
      } catch (err) {
        if (isTimeoutError(err)) throw new TtsProviderError("openrouter", "timeout", "OpenRouter request timed out");
        throw new TtsProviderError("openrouter", "unknown", err instanceof Error ? err.message : "OpenRouter request failed");
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new TtsProviderError(
          "openrouter",
          classifyStatus(response.status),
          `OpenRouter request failed (${response.status}): ${body.slice(0, 300)}`,
        );
      }

      // Same raw-bytes response shape as OpenAI's /audio/speech — no
      // alignment/timings, so read-along highlighting isn't available here.
      const audio = await readCapped(response);
      if (audio.length === 0) throw new TtsProviderError("openrouter", "empty_response", "OpenRouter returned no audio");

      return { audio, format: "mp3", timings: null };
    },
    // OpenRouter has no separate voices endpoint — voice IDs are per-model,
    // exposed as `supported_voices` on the model catalog itself (some models
    // report none; that's a real "unknown", not a fetch failure, so this
    // returns [] rather than throwing — the caller falls back to a free-text
    // voice field in that case).
    async listVoices(model?: string): Promise<TtsVoiceInfo[]> {
      const models = await fetchOpenRouterModels("tts");
      const found = models.find((m) => m.id === (model || DEFAULT_OPENROUTER_TTS_MODEL));
      const voices = found?.supportedVoices;
      if (!voices || voices.length === 0) return [];
      return voices.map((id) => ({ id, name: id }));
    },
  };
}
