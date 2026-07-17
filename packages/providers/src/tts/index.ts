import type { db as DbInstance } from "@distill/db";
import type { TtsProviderKind, TtsTimings } from "@distill/shared";
import { resolveCredential } from "../credentials.js";
import { chunkText } from "../summary/chunk.js";
import type { ResolvedCredential } from "../summary/types.js";
import { concatMp3, concatWav } from "./audio-concat.js";
import { createElevenLabsClient } from "./elevenlabs.js";
import {
  DEFAULT_TTS_MODELS,
  DEFAULT_TTS_VOICES,
  TTS_CHUNK_CHARS,
  TTS_MAX_SINGLE_PASS_CHARS,
  TTS_SETTINGS_VERSION,
} from "./models.js";
import { createOpenAiTtsClient } from "./openai.js";
import { createPiperClient } from "./piper.js";
import { TtsProviderError, type TtsProviderClient, type TtsSynthesizeResult, type TtsVoiceInfo } from "./types.js";

export * from "./audio-concat.js";
export * from "./models.js";
export * from "./types.js";

type Db = typeof DbInstance;

function createClient(provider: TtsProviderKind, credential: ResolvedCredential): TtsProviderClient {
  switch (provider) {
    case "elevenlabs":
      if (!credential.apiKey) throw new TtsProviderError(provider, "auth", "No ElevenLabs API key configured");
      return createElevenLabsClient(credential.apiKey, credential.baseUrl);
    case "piper":
      if (!credential.baseUrl) throw new TtsProviderError(provider, "auth", "No Piper base URL configured");
      return createPiperClient(credential.baseUrl);
    case "openai":
      if (!credential.apiKey) throw new TtsProviderError(provider, "auth", "No OpenAI API key configured");
      return createOpenAiTtsClient(credential.apiKey, credential.baseUrl);
  }
}

export interface GenerateTtsOptions {
  db: Db;
  userId: string;
  provider: TtsProviderKind;
  articleText: string;
  voice?: string;
  model?: string;
  speed?: number;
}

export interface GenerateTtsResult {
  provider: TtsProviderKind;
  voice: string;
  // Only set for providers with a model concept (ElevenLabs); null for Piper.
  model: string | null;
  format: string;
  audio: Buffer;
  durationSeconds: number | null;
  charCount: number;
  timings: TtsTimings | null;
  settingsVersion: string;
}

/** The voice that will be used for `provider` absent an explicit override — needed by callers before generation, to compute the cache key. */
export function resolveTtsVoice(provider: TtsProviderKind, requestedVoice?: string): string {
  return requestedVoice || DEFAULT_TTS_VOICES[provider];
}

/** The model that will be used for `provider` absent an explicit override — null for providers with no model concept (Piper). */
export function resolveTtsModel(provider: TtsProviderKind, requestedModel?: string): string | null {
  const fallback = DEFAULT_TTS_MODELS[provider];
  if (!fallback) return null;
  return requestedModel || fallback;
}

// Combines each chunk's per-character timings into one timeline, offsetting
// later chunks by the cumulative duration of everything before them (no
// silence is inserted between chunks, so each chunk's timings pick up
// exactly where the previous one's audio ends).
function mergeTimings(results: TtsSynthesizeResult[]): { timings: TtsTimings | null; durationSeconds: number | null } {
  let offset = 0;
  const characters: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];

  for (const result of results) {
    if (result.timings) {
      characters.push(...result.timings.characters);
      starts.push(...result.timings.characterStartTimesSeconds.map((t) => t + offset));
      ends.push(...result.timings.characterEndTimesSeconds.map((t) => t + offset));
      offset += result.timings.characterEndTimesSeconds.at(-1) ?? 0;
    }
  }

  if (characters.length === 0) return { timings: null, durationSeconds: null };
  return {
    timings: { characters, characterStartTimesSeconds: starts, characterEndTimesSeconds: ends },
    durationSeconds: ends.at(-1) ?? null,
  };
}

/**
 * Resolves the user's credential for `provider`, then synthesizes
 * `articleText` — a single call for short articles, chunked and
 * concatenated for long ones (PLAN §7.2). Throws TtsProviderError on any
 * failure; callers must surface it explicitly rather than swallowing it.
 */
export async function generateTts(opts: GenerateTtsOptions): Promise<GenerateTtsResult> {
  const credential = await resolveCredential(opts.db, opts.userId, opts.provider);
  if (!credential) {
    throw new TtsProviderError(opts.provider, "auth", `No ${opts.provider} credential configured`);
  }

  const client = createClient(opts.provider, credential);
  const voice = resolveTtsVoice(opts.provider, opts.voice);
  const model = resolveTtsModel(opts.provider, opts.model);
  const speed = opts.speed ?? 1;

  const chunks =
    opts.articleText.length > TTS_MAX_SINGLE_PASS_CHARS
      ? chunkText(opts.articleText, TTS_CHUNK_CHARS)
      : [opts.articleText];

  const results: TtsSynthesizeResult[] = [];
  for (const chunk of chunks) {
    results.push(await client.synthesize({ text: chunk, voice, speed, model: model ?? undefined }));
  }

  const format = results[0].format;
  let audio: Buffer;
  let durationSeconds: number | null;
  let timings: TtsTimings | null = null;

  if (format === "wav") {
    const concatenated = concatWav(results.map((r) => r.audio));
    audio = concatenated.audio;
    durationSeconds = concatenated.durationSeconds;
  } else {
    audio = concatMp3(results.map((r) => r.audio));
    ({ timings, durationSeconds } = mergeTimings(results));
  }

  return {
    provider: opts.provider,
    voice,
    model,
    format,
    audio,
    durationSeconds,
    charCount: opts.articleText.length,
    timings,
    settingsVersion: TTS_SETTINGS_VERSION,
  };
}

/** Lists the available voices for `provider` using the user's stored credential. */
export async function listTtsVoices(db: Db, userId: string, provider: TtsProviderKind): Promise<TtsVoiceInfo[]> {
  const credential = await resolveCredential(db, userId, provider);
  if (!credential) throw new TtsProviderError(provider, "auth", `No ${provider} credential configured`);
  return createClient(provider, credential).listVoices();
}
