import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// AEAD encryption for stored provider API keys (PLAN §10.3). `ENCRYPTION_KEY`
// is also used to HMAC-sign image-proxy URLs (packages/extract/src/image-proxy.ts);
// HKDF-deriving a distinct subkey here keeps the two uses cryptographically
// separated even though they share one root secret in `.env`.
const HKDF_INFO = Buffer.from("distill-credential-secret-v1");
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveKey(): Buffer {
  const master = process.env.ENCRYPTION_KEY;
  if (!master) throw new Error("ENCRYPTION_KEY is required to encrypt/decrypt stored credentials");
  const masterKey = Buffer.from(master, "base64");
  return Buffer.from(hkdfSync("sha256", masterKey, Buffer.alloc(0), HKDF_INFO, KEY_LENGTH));
}

/** Encrypts `plaintext` into `iv || authTag || ciphertext` for storage in `api_credential.secret_encrypted`. */
export function encryptSecret(plaintext: string): Buffer {
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

/** Inverse of encryptSecret(). Throws if the key is wrong or the ciphertext was tampered with. */
export function decryptSecret(stored: Buffer): string {
  const key = deriveKey();
  const iv = stored.subarray(0, IV_LENGTH);
  const authTag = stored.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = stored.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
}
