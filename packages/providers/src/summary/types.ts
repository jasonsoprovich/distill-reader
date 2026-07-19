import type { SummaryProviderKind } from "@distill/shared";

export interface SummaryClientRequest {
  systemPrompt: string;
  userContent: string;
  model: string;
}

export interface SummaryClientResult {
  content: string;
  model: string;
}

export interface SummaryProviderClient {
  provider: SummaryProviderKind;
  complete(req: SummaryClientRequest): Promise<SummaryClientResult>;
}

export type SummaryErrorCode = "auth" | "rate_limit" | "timeout" | "empty_response" | "unknown";

// Never fails silently (PLAN §6.3's precis footnote) — every provider
// client throws one of these, carrying enough detail for the API route to
// surface a specific message and log it to audit_log rather than a bare 500.
export class SummaryProviderError extends Error {
  readonly provider: SummaryProviderKind;
  readonly code: SummaryErrorCode;

  constructor(provider: SummaryProviderKind, code: SummaryErrorCode, message: string) {
    super(message);
    this.name = "SummaryProviderError";
    this.provider = provider;
    this.code = code;
  }
}

export interface ResolvedCredential {
  apiKey: string | null;
  baseUrl: string | null;
  // Only meaningful for relay-eligible TTS providers (piper/kokoro) — see
  // packages/shared's RELAY_TTS_PROVIDERS and tts/index.ts's relay branch.
  // Always false for summary-only credentials.
  viaRelay: boolean;
}
