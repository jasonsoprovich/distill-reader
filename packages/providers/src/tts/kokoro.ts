// See piper.ts's identical import for why this is a deep import rather than
// @distill/extract's root barrel.
import { readCapped, safeFetch } from "@distill/extract/net/safe-fetch.js";
import { classifyStatus, isTimeoutError } from "./http.js";
import { TTS_REQUEST_TIMEOUT_MS } from "./models.js";
import { TtsProviderError, type TtsSynthesizeRequest, type TtsSynthesizeResult, type TtsProviderClient, type TtsVoiceInfo } from "./types.js";

// Kokoro-FastAPI (https://github.com/remsky/Kokoro-FastAPI, verified
// against its current docs, not memorized) wraps the open-weight Kokoro-82M
// model behind an OpenAI-compatible /v1/audio/speech + /v1/audio/voices
// API — self-hosted and keyless like Piper, just with an OpenAI-shaped
// request/response instead of Piper's bespoke one. "kokoro" is its only
// model, hardcoded here rather than user-configurable (same reasoning as
// Piper having no model concept at all).
const MODEL = "kokoro";

// Same deliberate exception as Piper's trustedPiperHosts — a self-hosted
// sidecar address, often on a private network, allowlisted through
// safeFetch's SSRF check. See that function's comment for the full
// operator-env-var-vs-stored-credential trust writeup; identical reasoning
// applies here with KOKORO_BASE_URL in place of PIPER_BASE_URL.
function trustedKokoroHosts(root: string): string[] {
  const hosts = new Set<string>();
  const configured = process.env.KOKORO_BASE_URL;
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

export function createKokoroClient(baseUrl: string): TtsProviderClient {
  const root = baseUrl.replace(/\/$/, "");

  return {
    provider: "kokoro",
    async synthesize({ text, voice, speed }: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
      let response: Response;
      try {
        response = await safeFetch(`${root}/v1/audio/speech`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          timeoutMs: TTS_REQUEST_TIMEOUT_MS,
          allowedHosts: trustedKokoroHosts(root),
          body: JSON.stringify({ model: MODEL, input: text, voice, response_format: "mp3", speed }),
        });
      } catch (err) {
        if (isTimeoutError(err)) throw new TtsProviderError("kokoro", "timeout", "Kokoro request timed out");
        throw new TtsProviderError("kokoro", "unknown", err instanceof Error ? err.message : "Kokoro request failed");
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new TtsProviderError(
          "kokoro",
          classifyStatus(response.status),
          `Kokoro request failed (${response.status}): ${body.slice(0, 300)}`,
        );
      }

      // Non-streaming /v1/audio/speech returns raw audio bytes directly
      // (same shape as Piper/OpenAI), not JSON — no alignment/timings come
      // back this way. Kokoro-FastAPI does expose per-word timestamps via a
      // separate /dev/captioned_speech streaming endpoint, but that's a
      // different (word-level, not character-level) shape than what
      // buildHighlightWords expects from ElevenLabs, so read-along
      // highlighting isn't wired up for Kokoro here.
      const audio = await readCapped(response);
      if (audio.length === 0) throw new TtsProviderError("kokoro", "empty_response", "Kokoro returned no audio");

      return { audio, format: "mp3", timings: null };
    },
    async listVoices(): Promise<TtsVoiceInfo[]> {
      let response: Response;
      try {
        response = await safeFetch(`${root}/v1/audio/voices`, {
          timeoutMs: TTS_REQUEST_TIMEOUT_MS,
          allowedHosts: trustedKokoroHosts(root),
        });
      } catch (err) {
        if (isTimeoutError(err)) throw new TtsProviderError("kokoro", "timeout", "Kokoro request timed out");
        throw new TtsProviderError("kokoro", "unknown", err instanceof Error ? err.message : "Kokoro request failed");
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new TtsProviderError(
          "kokoro",
          classifyStatus(response.status),
          `Kokoro request failed (${response.status}): ${body.slice(0, 300)}`,
        );
      }

      const buf = await readCapped(response);
      const data = JSON.parse(buf.toString("utf-8")) as { voices?: { id: string }[] };
      return (data.voices ?? []).map((v) => ({ id: v.id, name: v.id }));
    },
  };
}
