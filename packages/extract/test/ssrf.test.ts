import { describe, expect, it } from "vitest";
import { isBlockedAddress } from "../src/net/ssrf.js";

describe("isBlockedAddress", () => {
  const blocked = [
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "127.0.0.1",
    "169.254.169.254", // cloud metadata endpoint
    "0.0.0.0",
    "100.64.0.1",
    "224.0.0.1",
    "240.0.0.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd12:3456:789a::1",
    "::",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.5",
  ];

  const allowed = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"];

  it.each(blocked)("blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(allowed)("allows %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });

  it("fails closed on unparsable input", () => {
    expect(isBlockedAddress("not-an-ip")).toBe(true);
  });
});
