import type { RelayTtsProviderKind, TtsProviderKind, TtsTimings } from "@distill/shared";

export interface TtsSynthesizeRequest {
  text: string;
  voice: string;
  // 0.5-2, matches ttsPrefsSchema's range; each provider maps it onto its
  // own speed knob (or clamps to its own supported range).
  speed: number;
  // Only read by providers with a model concept (ElevenLabs); ignored
  // otherwise.
  model?: string;
}

export interface TtsSynthesizeResult {
  audio: Buffer;
  format: string;
  // Per-chunk alignment when the provider supplies it (ElevenLabs); null
  // otherwise (Piper). The caller offsets and concatenates across chunks.
  timings: TtsTimings | null;
}

export interface TtsVoiceInfo {
  id: string;
  name: string;
  // ElevenLabs' own grouping ("premade" | "cloned" | "generated" |
  // "professional") — absent for providers with no such concept (Piper).
  category?: string;
}

export interface TtsProviderClient {
  provider: TtsProviderKind;
  synthesize(req: TtsSynthesizeRequest): Promise<TtsSynthesizeResult>;
  listVoices(): Promise<TtsVoiceInfo[]>;
}

// Implemented by apps/api's agent registry, injected into generateTts() so
// this package never imports app-level code (keeping the existing
// providers-has-no-app-deps direction intact). Dispatches a single job to
// whichever relay agent is currently connected for `userId`, over the
// WebSocket opened by apps/relay-agent — throws TtsProviderError(provider,
// "unavailable", ...) when no agent is connected.
export interface RelayDispatcher {
  synthesize(userId: string, provider: RelayTtsProviderKind, req: TtsSynthesizeRequest): Promise<TtsSynthesizeResult>;
  listVoices(userId: string, provider: RelayTtsProviderKind): Promise<TtsVoiceInfo[]>;
}

// "unavailable": the relay-backed provider has no agent currently connected
// (packages/providers/src/tts/index.ts's relay branch) — distinct from
// "auth" (bad/missing credential) since the credential is fine, the user's
// machine just isn't online right now.
export type TtsErrorCode = "auth" | "rate_limit" | "timeout" | "empty_response" | "unavailable" | "unknown";

// Never fails silently (PLAN §7.2's "surface provider errors explicitly" —
// the same anti-silent-failure rule as summaries, PLAN §6.3).
export class TtsProviderError extends Error {
  readonly provider: TtsProviderKind;
  readonly code: TtsErrorCode;

  constructor(provider: TtsProviderKind, code: TtsErrorCode, message: string) {
    super(message);
    this.name = "TtsProviderError";
    this.provider = provider;
    this.code = code;
  }
}
