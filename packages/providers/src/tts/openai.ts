import { readCapped, safeFetch } from "@distill/extract";
import { OPENAI_TTS_VOICES } from "@distill/shared";
import { classifyStatus, isTimeoutError } from "./http.js";
import { TTS_REQUEST_TIMEOUT_MS } from "./models.js";
import { TtsProviderError, type TtsSynthesizeRequest, type TtsSynthesizeResult, type TtsProviderClient, type TtsVoiceInfo } from "./types.js";

// OpenAI's speed range (0.25-4.0) is wider than our own 0.5-2 UI range, so
// unlike ElevenLabs there's nothing to clamp here — every value the UI can
// produce is already valid.

export function createOpenAiTtsClient(apiKey: string, baseUrl?: string | null): TtsProviderClient {
  const root = (baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");

  return {
    provider: "openai",
    async synthesize({ text, voice, speed, model }: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
      let response: Response;
      try {
        // baseUrl is user-settable (a custom OpenAI-compatible gateway), so
        // it goes through the same SSRF-checked fetcher as every other
        // user-supplied URL in this codebase (PLAN §10.2), not a bare fetch.
        response = await safeFetch(`${root}/audio/speech`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          timeoutMs: TTS_REQUEST_TIMEOUT_MS,
          body: JSON.stringify({
            model,
            input: text,
            voice,
            response_format: "mp3",
            speed,
          }),
        });
      } catch (err) {
        if (isTimeoutError(err)) throw new TtsProviderError("openai", "timeout", "OpenAI request timed out");
        throw new TtsProviderError("openai", "unknown", err instanceof Error ? err.message : "OpenAI request failed");
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new TtsProviderError(
          "openai",
          classifyStatus(response.status),
          `OpenAI request failed (${response.status}): ${body.slice(0, 300)}`,
        );
      }

      // Unlike ElevenLabs' JSON-wrapped, base64-encoded response, /audio/speech
      // returns the raw audio bytes directly as the response body (same shape
      // as Piper's endpoint) — no alignment/timings are returned at all, so
      // read-along highlighting isn't available for OpenAI-narrated audio.
      const audio = await readCapped(response);
      if (audio.length === 0) throw new TtsProviderError("openai", "empty_response", "OpenAI returned no audio");

      return { audio, format: "mp3", timings: null };
    },
    // OpenAI has no endpoint to list its built-in TTS voices — they're a
    // fixed, documented set of names, not a per-account catalog like
    // ElevenLabs', so this is a static list rather than an HTTP call.
    async listVoices(): Promise<TtsVoiceInfo[]> {
      return OPENAI_TTS_VOICES.map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1) }));
    },
  };
}
