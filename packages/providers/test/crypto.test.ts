import { beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../src/crypto.js";

beforeEach(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a plaintext secret", () => {
    const plaintext = "sk-test-1234567890";
    const stored = encryptSecret(plaintext);
    expect(decryptSecret(stored)).toBe(plaintext);
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const a = encryptSecret("same-secret");
    const b = encryptSecret("same-secret");
    expect(a.equals(b)).toBe(false);
  });

  it("throws when the ciphertext has been tampered with", () => {
    const stored = encryptSecret("sk-test");
    stored[stored.length - 1] ^= 0xff;
    expect(() => decryptSecret(stored)).toThrow();
  });

  it("throws when decrypted with the wrong key", () => {
    const stored = encryptSecret("sk-test");
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(() => decryptSecret(stored)).toThrow();
  });

  it("throws when ENCRYPTION_KEY is unset", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(/ENCRYPTION_KEY/);
  });
});
