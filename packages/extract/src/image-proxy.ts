import { createHmac, timingSafeEqual } from "node:crypto";

// Signs/verifies image-proxy URLs (PLAN §10.1/§9 `GET /img`): the reader
// never renders a third-party image src directly, only this signed,
// same-origin-to-the-API URL, so a compromised article body can't be used
// to fire arbitrary cross-origin requests or leak referrer/tracking data.

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error("ENCRYPTION_KEY is required to sign image proxy URLs");
  return Buffer.from(secret, "base64");
}

function sign(encodedUrl: string): string {
  return createHmac("sha256", getKey()).update(encodedUrl).digest("base64url");
}

/** Builds an absolute `${API origin}/img?u=&s=` URL for a remote image. */
export function signImageUrl(originalUrl: string): string {
  const encoded = Buffer.from(originalUrl, "utf-8").toString("base64url");
  const apiOrigin = (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
  return `${apiOrigin}/img?u=${encoded}&s=${sign(encoded)}`;
}

export function verifyImageSignature(encoded: string, signature: string): boolean {
  const expected = sign(encoded);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

export function decodeImageUrl(encoded: string): string {
  return Buffer.from(encoded, "base64url").toString("utf-8");
}
