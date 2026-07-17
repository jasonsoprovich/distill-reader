import { readCapped, safeFetch } from "@distill/extract";
import { classifyStatus, isTimeoutError } from "./http.js";
import { DEFAULT_TTS_MODELS, TTS_REQUEST_TIMEOUT_MS } from "./models.js";
import { TtsProviderError, type TtsSynthesizeRequest, type TtsSynthesizeResult, type TtsProviderClient, type TtsVoiceInfo } from "./types.js";

const DEFAULT_MODEL = DEFAULT_TTS_MODELS.elevenlabs as string;
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
  category?: string;
}

interface ElevenLabsVoicesResponse {
  voices?: ElevenLabsVoice[];
  has_more?: boolean;
  next_page_token?: string | null;
}

interface ElevenLabsSharedVoice {
  voice_id: string;
  name: string;
  category?: string;
}

interface ElevenLabsSharedVoicesResponse {
  voices?: ElevenLabsSharedVoice[];
  has_more?: boolean;
}

// /v2/voices returns only voices already in the user's own account (default
// premade selection + anything cloned/saved) — a few dozen at most. The much
// larger public catalog (hundreds of voices per model) lives behind the
// separate /v1/shared-voices endpoint and has to be fetched and merged in
// too, or the picker only ever shows a small slice of what ElevenLabs offers.
// Both capped at a sane page count, not a real limit, and both use page_size
// 100 (the max either endpoint accepts per page).
const VOICES_PAGE_SIZE = 100;
const MAX_VOICE_PAGES = 10;
const MAX_SHARED_VOICE_PAGES = 10;

export function createElevenLabsClient(apiKey: string, baseUrl?: string | null): TtsProviderClient {
  const root = (baseUrl || "https://api.elevenlabs.io").replace(/\/$/, "");

  return {
    provider: "elevenlabs",
    async synthesize({ text, voice, speed, model }: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
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
              model_id: model || DEFAULT_MODEL,
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
      const voices: ElevenLabsVoice[] = [];
      let nextPageToken: string | undefined;

      for (let page = 0; page < MAX_VOICE_PAGES; page++) {
        const params = new URLSearchParams({ page_size: String(VOICES_PAGE_SIZE), sort: "name", sort_direction: "asc" });
        if (nextPageToken) params.set("next_page_token", nextPageToken);

        let response: Response;
        try {
          response = await safeFetch(`${root}/v2/voices?${params}`, {
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
        voices.push(...(data.voices ?? []));
        if (!data.has_more || !data.next_page_token) break;
        nextPageToken = data.next_page_token;
      }

      // The public voice library is a distinct endpoint/response shape (page
      // index rather than a token, no fine-tuning/sharing metadata) — kept in
      // its own request loop and tagged with a category the account's own
      // voices never use, so it groups separately in the picker rather than
      // getting silently mixed into "premade".
      const sharedVoices: ElevenLabsSharedVoice[] = [];
      for (let page = 0; page < MAX_SHARED_VOICE_PAGES; page++) {
        const params = new URLSearchParams({ page_size: String(VOICES_PAGE_SIZE), page: String(page) });

        let response: Response;
        try {
          response = await safeFetch(`${root}/v1/shared-voices?${params}`, {
            headers: { "xi-api-key": apiKey },
            timeoutMs: TTS_REQUEST_TIMEOUT_MS,
          });
        } catch {
          // The shared library is a nice-to-have on top of the account's own
          // voices, which have already loaded successfully by this point —
          // degrade to just those rather than failing voice listing entirely.
          break;
        }
        if (!response.ok) break;

        const buf = await readCapped(response);
        const data = JSON.parse(buf.toString("utf-8")) as ElevenLabsSharedVoicesResponse;
        sharedVoices.push(...(data.voices ?? []));
        if (!data.has_more) break;
      }

      const ownVoiceIds = new Set(voices.map((v) => v.voice_id));
      for (const shared of sharedVoices) {
        if (ownVoiceIds.has(shared.voice_id)) continue;
        ownVoiceIds.add(shared.voice_id);
        voices.push({ voice_id: shared.voice_id, name: shared.name, category: "shared" });
      }

      // Cloned/generated/professional voices (the user's own) surfaced ahead
      // of ElevenLabs' large premade library, then the public shared library
      // last, alphabetically within each group — otherwise a big catalog
      // buries the few voices most users actually want.
      const categoryRank: Record<string, number> = {
        cloned: 0,
        generated: 0,
        professional: 0,
        premade: 1,
        shared: 2,
      };
      voices.sort((a, b) => {
        const rankDiff = (categoryRank[a.category ?? "premade"] ?? 1) - (categoryRank[b.category ?? "premade"] ?? 1);
        return rankDiff !== 0 ? rankDiff : a.name.localeCompare(b.name);
      });

      return voices.map((v) => ({ id: v.voice_id, name: v.name, category: v.category }));
    },
  };
}
