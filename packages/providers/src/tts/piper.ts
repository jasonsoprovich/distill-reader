import { readCapped, safeFetch } from "@distill/extract";
import { isTimeoutError } from "./http.js";
import { TTS_REQUEST_TIMEOUT_MS } from "./models.js";
import { TtsProviderError, type TtsSynthesizeRequest, type TtsSynthesizeResult, type TtsProviderClient, type TtsVoiceInfo } from "./types.js";

// piper.http_server's /voices returns a dict keyed by voice/model id
// (`{ "<voice name>": { <voice config> }, ... }`), not a list — the key IS
// the identifier accepted by /synthesize's `voice` field.
type PiperVoicesResponse = Record<string, unknown>;

// Piper's base_url is a self-hosted sidecar address, often on a private
// network — allowlisted through safeFetch's SSRF check only when it matches
// the deploy operator's configured PIPER_BASE_URL (PLAN §10.2's "deliberate,
// configured exception"), same pattern as Ollama.
function trustedPiperHosts(): string[] {
  const configured = process.env.PIPER_BASE_URL;
  if (!configured) return [];
  try {
    return [new URL(configured).hostname];
  } catch {
    return [];
  }
}

export function createPiperClient(baseUrl: string): TtsProviderClient {
  const root = baseUrl.replace(/\/$/, "");

  return {
    provider: "piper",
    async synthesize({ text, voice, speed }: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
      // Piper's length_scale is inverse to speed (higher = slower).
      const lengthScale = 1 / speed;

      let response: Response;
      try {
        response = await safeFetch(`${root}/synthesize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          timeoutMs: TTS_REQUEST_TIMEOUT_MS,
          allowedHosts: trustedPiperHosts(),
          body: JSON.stringify({ text, voice, length_scale: lengthScale }),
        });
      } catch (err) {
        if (isTimeoutError(err)) throw new TtsProviderError("piper", "timeout", "Piper request timed out");
        throw new TtsProviderError("piper", "unknown", err instanceof Error ? err.message : "Piper request failed");
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new TtsProviderError("piper", "unknown", `Piper request failed (${response.status}): ${body.slice(0, 300)}`);
      }

      const audio = await readCapped(response);
      if (audio.length === 0) throw new TtsProviderError("piper", "empty_response", "Piper returned no audio");

      return { audio, format: "wav", timings: null };
    },
    async listVoices(): Promise<TtsVoiceInfo[]> {
      let response: Response;
      try {
        response = await safeFetch(`${root}/voices`, {
          timeoutMs: TTS_REQUEST_TIMEOUT_MS,
          allowedHosts: trustedPiperHosts(),
        });
      } catch (err) {
        if (isTimeoutError(err)) throw new TtsProviderError("piper", "timeout", "Piper request timed out");
        throw new TtsProviderError("piper", "unknown", err instanceof Error ? err.message : "Piper request failed");
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new TtsProviderError("piper", "unknown", `Piper request failed (${response.status}): ${body.slice(0, 300)}`);
      }

      const buf = await readCapped(response);
      const data = JSON.parse(buf.toString("utf-8")) as PiperVoicesResponse;
      return Object.keys(data).map((id) => ({ id, name: id }));
    },
  };
}
