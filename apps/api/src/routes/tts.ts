import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db, ttsAudio } from "@distill/db";
import { listTtsVoices, TtsProviderError } from "@distill/providers";
import { TTS_PROVIDERS } from "@distill/shared";
import type { TtsProviderKind, TtsVoiceDTO } from "@distill/shared";
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { relayDispatcher } from "../lib/agent-registry.js";

export const ttsRouter = new Hono<{ Variables: AuthVariables }>();
ttsRouter.use("*", requireAuth);

function audioStoragePath(): string {
  return process.env.AUDIO_STORAGE_PATH || "/data/audio";
}

const CONTENT_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

function isTtsProviderKind(value: string): value is TtsProviderKind {
  return (TTS_PROVIDERS as readonly string[]).includes(value);
}

// PLAN §7.4 — populates the voice picker for whichever provider the user
// has a credential for.
ttsRouter.get("/voices", async (c) => {
  const userId = c.get("userId");
  const provider = c.req.query("provider");
  if (!provider || !isTtsProviderKind(provider)) {
    return c.json({ message: "Invalid or missing provider" }, 400);
  }

  try {
    const voices: TtsVoiceDTO[] = await listTtsVoices(db, userId, provider, relayDispatcher);
    return c.json(voices);
  } catch (err) {
    const status =
      err instanceof TtsProviderError && err.code === "auth"
        ? 401
        : err instanceof TtsProviderError && err.code === "unavailable"
          ? 503
          : 502;
    const message = err instanceof Error ? err.message : "Failed to list voices";
    return c.json({ message }, status);
  }
});

// Auth-scoped audio stream (PLAN §10.6): verifies the requesting user owns
// the tts_audio row before ever touching the file — never exposed as a
// public static directory, and Range-aware so the player's scrubber can
// seek without downloading the whole file first.
ttsRouter.get("/audio/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const [row] = await db.select().from(ttsAudio).where(and(eq(ttsAudio.id, id), eq(ttsAudio.userId, userId)));
  if (!row) return c.json({ message: "Not found" }, 404);

  let full: Buffer;
  try {
    full = await readFile(path.join(audioStoragePath(), row.storageKey));
  } catch {
    return c.json({ message: "Audio file missing" }, 404);
  }

  const contentType = CONTENT_TYPES[row.format] ?? "application/octet-stream";
  const range = c.req.header("range");
  if (!range) {
    return c.body(Uint8Array.from(full), 200, {
      "content-type": contentType,
      "content-length": String(full.length),
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=604800, immutable",
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const start = match?.[1] ? Number(match[1]) : 0;
  const end = match?.[2] ? Number(match[2]) : full.length - 1;
  if (!match || Number.isNaN(start) || Number.isNaN(end) || start > end || end >= full.length) {
    return c.body(null, 416, { "content-range": `bytes */${full.length}` });
  }

  const chunk = full.subarray(start, end + 1);
  return c.body(Uint8Array.from(chunk), 206, {
    "content-type": contentType,
    "content-length": String(chunk.length),
    "content-range": `bytes ${start}-${end}/${full.length}`,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=604800, immutable",
  });
});
