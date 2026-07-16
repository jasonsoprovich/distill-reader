import type { TtsProviderKind, TtsTimings } from "@distill/shared";

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

export type TtsErrorCode = "auth" | "rate_limit" | "timeout" | "empty_response" | "unknown";

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
