import { readCapped, safeFetch } from "@distill/extract";
import { DEFAULT_OPENROUTER_TTS_MODEL, OPENROUTER_BASE_URL } from "@distill/shared";
import { fetchOpenRouterModels } from "../openrouter-catalog.js";
import { buildWavHeader } from "./audio-concat.js";
import { classifyStatus, isTimeoutError } from "./http.js";
import { TTS_REQUEST_TIMEOUT_MS } from "./models.js";
import { TtsProviderError, type TtsSynthesizeRequest, type TtsSynthesizeResult, type TtsProviderClient, type TtsVoiceInfo } from "./types.js";

// OpenAI's own documented pcm convention (24kHz, mono, 16-bit signed LE) —
// used only as a fallback when a response's own Content-Type omits rate/
// channels, which shouldn't normally happen (see parsePcmContentType) but
// is a reasonable default given this endpoint is explicitly modeled on
// OpenAI's own /audio/speech API.
const DEFAULT_PCM_SAMPLE_RATE = 24_000;
const DEFAULT_PCM_CHANNELS = 1;
const PCM_BITS_PER_SAMPLE = 16;

// OpenRouter's pcm Content-Type carries the real sample rate/channel count
// for whichever backend served the request (verified against OpenRouter's
// own docs: "audio/pcm;rate=<rate>;channels=<n>") — every backend's raw pcm
// output can differ, so this must be read per-response rather than assumed
// fixed, or a WAV wrapped with the wrong rate would play back distorted
// (wrong speed/pitch) instead of failing outright.
function parsePcmContentType(contentType: string | null): { sampleRate: number; channels: number } {
  const rateMatch = contentType?.match(/rate=(\d+)/);
  const channelsMatch = contentType?.match(/channels=(\d+)/);
  return {
    sampleRate: rateMatch ? Number(rateMatch[1]) : DEFAULT_PCM_SAMPLE_RATE,
    channels: channelsMatch ? Number(channelsMatch[1]) : DEFAULT_PCM_CHANNELS,
  };
}

export function createOpenRouterTtsClient(apiKey: string): TtsProviderClient {
  async function requestSpeech(body: Record<string, unknown>): Promise<Response> {
    try {
      return await safeFetch(`${OPENROUTER_BASE_URL}/audio/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        timeoutMs: TTS_REQUEST_TIMEOUT_MS.openrouter,
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (isTimeoutError(err)) throw new TtsProviderError("openrouter", "timeout", "OpenRouter request timed out");
      throw new TtsProviderError("openrouter", "unknown", err instanceof Error ? err.message : "OpenRouter request failed");
    }
  }

  // response.text()/readCapped() both consume the body under the same
  // AbortSignal the initial fetch used (Node's fetch keeps it live for
  // streaming reads after headers arrive) — a slow-to-stream backend can
  // still abort here even though the initial connection succeeded, so this
  // needs the same timeout classification as the fetch itself. Previously
  // this wasn't wrapped, so a body-read abort surfaced as a raw, unclassified
  // "The operation was aborted due to timeout" (bare Node message, code
  // "unknown", 502) instead of the same clean "timeout" (504) case — found
  // via a stored tts_error audit_log row on a slow Kokoro-via-OpenRouter run.
  async function readBody(response: Response): Promise<Buffer> {
    try {
      return await readCapped(response);
    } catch (err) {
      if (isTimeoutError(err)) throw new TtsProviderError("openrouter", "timeout", "OpenRouter request timed out");
      throw new TtsProviderError("openrouter", "unknown", err instanceof Error ? err.message : "OpenRouter request failed");
    }
  }

  return {
    provider: "openrouter",
    async synthesize({ text, voice, speed, model }: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
      // Always pcm, never mp3: verified live that not every one of
      // OpenRouter's ~19 TTS backends supports mp3 (Gemini's rejects it
      // outright with a 400), but pcm is OpenRouter's own documented
      // endpoint-wide default — the one format every backend must support
      // for the endpoint's own default behavior to make sense. This also
      // keeps the output format fixed (always wav, wrapped below) rather
      // than varying per model, which matters because TTS_FORMATS.openrouter
      // is read to compute the cache lookup key *before* generation even
      // runs (articles.ts) — a per-model-varying format would make that
      // precomputed key wrong for whichever models don't take the "default"
      // path, permanently missing the cache and re-billing on every replay.
      const response = await requestSpeech({
        model: model || DEFAULT_OPENROUTER_TTS_MODEL,
        input: text,
        voice,
        speed,
        response_format: "pcm",
      });

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
      const pcm = await readBody(response);
      if (pcm.length === 0) throw new TtsProviderError("openrouter", "empty_response", "OpenRouter returned no audio");

      const { sampleRate, channels } = parsePcmContentType(response.headers.get("content-type"));
      const audio = Buffer.concat([buildWavHeader(pcm.length, sampleRate, channels, PCM_BITS_PER_SAMPLE), pcm]);

      return { audio, format: "wav", timings: null };
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
