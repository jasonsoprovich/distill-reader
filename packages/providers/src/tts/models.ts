import { ELEVENLABS_MODELS, OPENAI_TTS_MODELS, OPENAI_TTS_VOICES, type TtsProviderKind } from "@distill/shared";

// "Rachel" — ElevenLabs' long-standing stock voice id; Piper's default
// depends on whichever voice model the operator's sidecar has installed, so
// this is just a common convention (matches the piper.http_server example
// in its own docs) rather than a guaranteed-present id. OpenAI's default is
// just the first entry of its own fixed voice list. Kokoro's is its own
// flagship American-English voice (a/f prefix = American/female —
// Kokoro-FastAPI's own docs and examples default to it), bundled in every
// Kokoro-FastAPI image regardless of which voices an operator cares about.
export const DEFAULT_TTS_VOICES: Record<TtsProviderKind, string> = {
  elevenlabs: "21m00Tcm4TlvDq8ikWAM",
  piper: "en_US-lessac-medium",
  openai: OPENAI_TTS_VOICES[0],
  kokoro: "af_heart",
};

// ELEVENLABS_MODELS/OPENAI_TTS_MODELS themselves live in @distill/shared
// (PLAN §7.4) so the frontend picker can import them without pulling in
// this server-only package — this just derives each server default from
// its first entry, one source of truth either way. Kokoro has no model
// concept (like Piper), so it has no entry here.
export const DEFAULT_TTS_MODELS: Partial<Record<TtsProviderKind, string>> = {
  elevenlabs: ELEVENLABS_MODELS[0].id,
  openai: OPENAI_TTS_MODELS[0].id,
};

// Each provider always synthesizes to one fixed format (mp3 for ElevenLabs,
// OpenAI, and Kokoro, wav for Piper) — this lets a caller compute the cache
// key before calling generateTts().
export const TTS_FORMATS: Record<TtsProviderKind, string> = {
  elevenlabs: "mp3",
  piper: "wav",
  openai: "mp3",
  kokoro: "mp3",
};

// Bounds each provider HTTP call. Synthesis is slower than a summary
// completion, so this is longer than SUMMARY_REQUEST_TIMEOUT_MS.
export const TTS_REQUEST_TIMEOUT_MS = 60_000;

// Long articles are split before synthesis (PLAN §7.2) so the first chunk
// can play while the rest generate, and so no single request risks a
// provider's own request-size ceiling.
export const TTS_MAX_SINGLE_PASS_CHARS = 4_000;
export const TTS_CHUNK_CHARS = 3_000;

// Cache-invalidation key (mirrors summary's SUMMARY_PROMPT_VERSION) — bump
// when synthesis parameters change in a way that should miss old caches.
export const TTS_SETTINGS_VERSION = "v1";
