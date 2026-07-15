import type { TtsErrorCode } from "./types.js";

/** Maps a provider HTTP response's status to one of our error codes. */
export function classifyStatus(status: number): TtsErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  return "unknown";
}

export function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}
