import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { decodeImageUrl, readCapped, safeFetch, verifyImageSignature } from "@distill/extract";
import { Hono } from "hono";

export const imagesRouter = new Hono();

const CACHE_DIR = process.env.IMAGE_CACHE_PATH ?? path.join(process.cwd(), ".image-cache");
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = /^image\/(png|jpe?g|gif|webp|svg\+xml|avif|bmp|x-icon|vnd\.microsoft\.icon)/i;

async function readFromCache(key: string): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const [body, contentType] = await Promise.all([
      readFile(path.join(CACHE_DIR, key)),
      readFile(path.join(CACHE_DIR, `${key}.type`), "utf-8"),
    ]);
    return { body, contentType };
  } catch {
    return null;
  }
}

async function writeToCache(key: string, body: Buffer, contentType: string): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await Promise.all([
      writeFile(path.join(CACHE_DIR, key), body),
      writeFile(path.join(CACHE_DIR, `${key}.type`), contentType),
    ]);
  } catch {
    // Best-effort cache — a write failure shouldn't fail the request.
  }
}

/**
 * Signature-authorized, SSRF-guarded proxy for remote article images (PLAN
 * §9/§10.1). The reader never points an <img> at a third-party host
 * directly — only this signed, same-origin-to-the-API URL — so rendering
 * an article can't leak referrer/tracking data or be used to fire
 * arbitrary cross-origin requests. No session is required: the HMAC
 * signature (produced only by our own sanitizer) is the authorization,
 * and a plain <img> tag can't attach a session cookie's CORS credentials
 * anyway.
 */
imagesRouter.get("/", async (c) => {
  const encoded = c.req.query("u");
  const signature = c.req.query("s");
  if (!encoded || !signature || !verifyImageSignature(encoded, signature)) {
    return c.json({ message: "Invalid or missing signature" }, 403);
  }

  let originalUrl: string;
  try {
    originalUrl = decodeImageUrl(encoded);
    new URL(originalUrl);
  } catch {
    return c.json({ message: "Invalid image reference" }, 400);
  }

  const cacheKey = createHash("sha256").update(originalUrl).digest("hex");
  const cached = await readFromCache(cacheKey);
  if (cached) {
    return c.body(Uint8Array.from(cached.body), 200, {
      "content-type": cached.contentType,
      "cache-control": "public, max-age=604800, immutable",
    });
  }

  let response: Response;
  try {
    response = await safeFetch(originalUrl);
  } catch {
    return c.json({ message: "Failed to fetch image" }, 502);
  }
  if (!response.ok) return c.json({ message: "Failed to fetch image" }, 502);

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  if (!ALLOWED_CONTENT_TYPES.test(contentType)) {
    return c.json({ message: "Unsupported content type" }, 415);
  }

  let body: Buffer;
  try {
    body = await readCapped(response, MAX_IMAGE_BYTES);
  } catch {
    return c.json({ message: "Image too large" }, 502);
  }

  await writeToCache(cacheKey, body, contentType);

  return c.body(Uint8Array.from(body), 200, {
    "content-type": contentType,
    "cache-control": "public, max-age=604800, immutable",
  });
});
