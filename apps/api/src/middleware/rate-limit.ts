import { rateLimiter } from "hono-rate-limiter";
import type { Context } from "hono";
import type { AuthVariables } from "./auth.js";

// Real client IP requires a trusted reverse proxy in front (§11) to set
// X-Forwarded-For; falls back to a single shared "unknown" bucket for
// direct/unproxied deployments rather than trusting an unset/spoofable value.
function clientIp(c: Context): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

const WINDOW_MS = 15 * 60 * 1000;

// Blunt, global abuse control (PLAN §10.6). Runs ahead of auth in index.ts,
// so it's keyed by IP rather than user id — it also covers unauthenticated
// routes like /auth/*.
export const globalRateLimit = rateLimiter({
  windowMs: WINDOW_MS,
  limit: 300,
  standardHeaders: "draft-7",
  keyGenerator: clientIp,
});

// Stricter limit on auth endpoints specifically (PLAN §10.4 — blunt brute
// force on login/reset).
export const authRateLimit = rateLimiter({
  windowMs: WINDOW_MS,
  limit: 20,
  standardHeaders: "draft-7",
  keyGenerator: clientIp,
});

// Stricter per-user limit for routes that cost money or CPU: feed poll,
// summary/TTS generation (PLAN §10.6). Keyed by the authenticated user id —
// safe to read since this is always chained after requireAuth on the same
// route.
export const costlyRouteRateLimit = rateLimiter<{ Variables: AuthVariables }>({
  windowMs: WINDOW_MS,
  limit: 20,
  standardHeaders: "draft-7",
  keyGenerator: (c) => c.get("userId"),
});
