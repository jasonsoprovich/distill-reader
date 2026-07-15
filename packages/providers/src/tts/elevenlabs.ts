import { readCapped, safeFetch } from "@distill/extract";
import { classifyStatus, isTimeoutError } from "./http.js";
import { TTS_REQUEST_TIMEOUT_MS } from "./models.js";
import { TtsProviderError, type TtsSynthesizeRequest, type TtsSynthesizeResult, type TtsProviderClient, type TtsVoiceInfo } from "./types.js";

const DEFAULT_MODEL = "eleven_multilingual_v2";
const OUTPUT_FORMAT = "mp3_44100_128";

// ElevenLabs' voice_settings.speed is a narrower knob than our own 0.5-2 UI
// range — clamp rather than pass through so an out-of-range value 422s.
const MIN_PROVIDER_SPEED = 0.7;
const MAX_PROVIDER_SPEED = 1.2;

interface ElevenLabsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

interface ElevenLabsSpeechResponse {
  audio_base64?: string;
  alignment?: ElevenLabsAlignment;
}

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
}

interface ElevenLabsVoicesResponse {
  voices?: ElevenLabsVoice[];
}

export function createElevenLabsClient(apiKey: string, baseUrl?: string | null): TtsProviderClient {
  const root = (baseUrl || "https://api.elevenlabs.io").replace(/\/$/, "");

  return {
    provider: "elevenlabs",
    async synthesize({ text, voice, speed }: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
      const clampedSpeed = Math.min(MAX_PROVIDER_SPEED, Math.max(MIN_PROVIDER_SPEED, speed));

      let response: Response;
      try {
        response = await safeFetch(
          `${root}/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=${OUTPUT_FORMAT}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
            timeoutMs: TTS_REQUEST_TIMEOUT_MS,
            body: JSON.stringify({
              text,
              model_id: DEFAULT_MODEL,
              voice_settings: clampedSpeed === 1 ? undefined : { speed: clampedSpeed },
            }),
          },
        );
      } catch (err) {
        if (isTimeoutError(err)) throw new TtsProviderError("elevenlabs", "timeout", "ElevenLabs request timed out");
        throw new TtsProviderError(
          "elevenlabs",
          "unknown",
          err instanceof Error ? err.message : "ElevenLabs request failed",
        );
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new TtsProviderError(
          "elevenlabs",
          classifyStatus(response.status),
          `ElevenLabs request failed (${response.status}): ${body.slice(0, 300)}`,
        );
      }

      const buf = await readCapped(response);
      const data = JSON.parse(buf.toString("utf-8")) as ElevenLabsSpeechResponse;
      if (!data.audio_base64) throw new TtsProviderError("elevenlabs", "empty_response", "ElevenLabs returned no audio");

      return {
        audio: Buffer.from(data.audio_base64, "base64"),
        format: "mp3",
        timings: data.alignment
          ? {
              characters: data.alignment.characters,
              characterStartTimesSeconds: data.alignment.character_start_times_seconds,
              characterEndTimesSeconds: data.alignment.character_end_times_seconds,
            }
          : null,
      };
    },
    async listVoices(): Promise<TtsVoiceInfo[]> {
      let response: Response;
      try {
        response = await safeFetch(`${root}/v2/voices`, {
          headers: { "xi-api-key": apiKey },
          timeoutMs: TTS_REQUEST_TIMEOUT_MS,
        });
      } catch (err) {
        if (isTimeoutError(err)) throw new TtsProviderError("elevenlabs", "timeout", "ElevenLabs request timed out");
        throw new TtsProviderError(
          "elevenlabs",
          "unknown",
          err instanceof Error ? err.message : "ElevenLabs request failed",
        );
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new TtsProviderError(
          "elevenlabs",
          classifyStatus(response.status),
          `ElevenLabs request failed (${response.status}): ${body.slice(0, 300)}`,
        );
      }

      const buf = await readCapped(response);
      const data = JSON.parse(buf.toString("utf-8")) as ElevenLabsVoicesResponse;
      return (data.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name }));
    },
  };
}
