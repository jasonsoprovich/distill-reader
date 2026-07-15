import type { SummaryProviderKind } from "@distill/shared";

export const DEFAULT_SUMMARY_MODELS: Record<SummaryProviderKind, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5",
  ollama: "llama3.1",
};

// Bounds each provider HTTP call (PLAN §6.2: "enforce timeouts... never
// block the API event loop" — an async fetch doesn't block the loop, but an
// unbounded one could hang a request or a worker tick indefinitely).
export const SUMMARY_REQUEST_TIMEOUT_MS = 45_000;
