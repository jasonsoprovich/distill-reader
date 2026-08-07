import {
  DEFAULT_OPENROUTER_TTS_MODEL,
  ELEVENLABS_MODELS,
  OPENAI_TTS_MODELS,
  OPENAI_TTS_VOICES,
  type TtsProviderKind,
} from "@distill/shared";

// "Rachel" — ElevenLabs' long-standing stock voice id; Piper's default
// depends on whichever voice model the operator's sidecar has installed, so
// this is just a common convention (matches the piper.http_server example
// in its own docs) rather than a guaranteed-present id. OpenAI's default is
// just the first entry of its own fixed voice list. Kokoro's is its own
// flagship American-English voice (a/f prefix = American/female —
// Kokoro-FastAPI's own docs and examples default to it), bundled in every
// Kokoro-FastAPI image regardless of which voices an operator cares about.
// OpenRouter's is the first voice DEFAULT_OPENROUTER_TTS_MODEL reports
// (see openrouter-catalog.ts) — "eve", verified against the live catalog.
export const DEFAULT_TTS_VOICES: Record<TtsProviderKind, string> = {
  elevenlabs: "21m00Tcm4TlvDq8ikWAM",
  piper: "en_US-lessac-medium",
  openai: OPENAI_TTS_VOICES[0],
  kokoro: "af_heart",
  openrouter: "eve",
};

// ELEVENLABS_MODELS/OPENAI_TTS_MODELS themselves live in @distill/shared
// (PLAN §7.4) so the frontend picker can import them without pulling in
// this server-only package — this just derives each server default from
// its first entry, one source of truth either way. Kokoro has no model
// concept (like Piper), so it has no entry here. OpenRouter's catalog is
// too large/dynamic for a static list (see openrouter-catalog.ts) — its
// default is DEFAULT_OPENROUTER_TTS_MODEL instead of a first-entry lookup.
export const DEFAULT_TTS_MODELS: Partial<Record<TtsProviderKind, string>> = {
  elevenlabs: ELEVENLABS_MODELS[0].id,
  openai: OPENAI_TTS_MODELS[0].id,
  openrouter: DEFAULT_OPENROUTER_TTS_MODEL,
};

// Each provider always synthesizes to one fixed format — this lets a caller
// compute the cache key before calling generateTts(). OpenRouter is wav
// (its client always requests pcm and wraps it — see tts/openrouter.ts for
// why: not every one of its ~19 TTS backends supports mp3, and this field
// being fixed rather than varying per model is what keeps the cache lookup
// correct), matching Piper; every other provider is mp3.
export const TTS_FORMATS: Record<TtsProviderKind, string> = {
  elevenlabs: "mp3",
  piper: "wav",
  openai: "mp3",
  kokoro: "mp3",
  openrouter: "wav",
};

// Bounds each provider HTTP call. Synthesis is slower than a summary
// completion, so these are longer than SUMMARY_REQUEST_TIMEOUT_MS.
//
// Piper/Kokoro get double the cloud providers' budget: they run CPU-bound
// synthesis on a self-hosted sidecar rather than a provisioned cloud GPU
// fleet, so throughput varies a lot more with the operator's own hardware.
// Measured ~30-35 chars/sec against this repo's own Kokoro-FastAPI CPU
// container — comfortable under even the shared 60s budget at the chunk
// sizes below — but slower/cold-starting hardware (or a model still loading
// into memory on a request that races it) can fall well under that, and a
// bare 60s budget leaves little room before a legitimately-in-progress
// synthesis gets aborted and reported as a timeout. 120s leaves headroom
// for hardware running at roughly a third of that measured rate.
// OpenRouter gets a longer budget than the other cloud providers' 60s:
// unlike ElevenLabs/OpenAI (one vendor, one known latency profile),
// OpenRouter fronts ~19 unrelated TTS backends of wildly different speed —
// including small open-weight models (e.g. its own hexgrad/kokoro-82m
// listing) that can be much slower via OpenRouter's hosting than this
// repo's own self-hosted Kokoro/Piper sidecars.
//
// It's deliberately capped below Piper/Kokoro's 120s, though, not matched to
// it: a cloud deployment sitting behind Cloudflare (this repo's own
// reference deployment does) gets a **hard, unconfigurable ~100s origin
// read timeout on Free/Pro plans** — verified by SSHing into that
// deployment and finding neither the API container nor its own reverse
// proxy (Traefik) logged anything for a failed request, meaning Cloudflare
// killed the connection before it ever reached either. A timeout here at or
// above that ceiling means Cloudflare's own bare error page (no CORS
// header, since it isn't from this app) always wins the race against our
// own clean, specific one — worse than just being slow. 90s keeps a 10s
// margin under that ceiling.
export const TTS_REQUEST_TIMEOUT_MS: Record<TtsProviderKind, number> = {
  elevenlabs: 60_000,
  openai: 60_000,
  piper: 120_000,
  kokoro: 120_000,
  openrouter: 90_000,
};

// Long articles are split before synthesis (PLAN §7.2) so the first chunk
// can play while the rest generate, and so no single request risks a
// provider's own request-size ceiling.
export const TTS_MAX_SINGLE_PASS_CHARS: Record<TtsProviderKind, number> = {
  elevenlabs: 4_000,
  openai: 4_000,
  piper: 1_200,
  kokoro: 1_200,
  openrouter: 4_000,
};
export const TTS_CHUNK_CHARS: Record<TtsProviderKind, number> = {
  elevenlabs: 3_000,
  openai: 3_000,
  piper: 1_000,
  kokoro: 1_000,
  openrouter: 3_000,
};

// Cache-invalidation key (mirrors summary's SUMMARY_PROMPT_VERSION) — bump
// when synthesis parameters change in a way that should miss old caches.
export const TTS_SETTINGS_VERSION = "v1";
