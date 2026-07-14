import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { safeFetch, SsrfBlockedError } from "../src/net/safe-fetch.js";

describe("safeFetch", () => {
  it("blocks a direct request to a loopback address", async () => {
    await expect(safeFetch("http://127.0.0.1:9/")).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("blocks a scheme outside the http/https allowlist", async () => {
    await expect(safeFetch("file:///etc/passwd")).rejects.toThrow();
  });

  it("re-validates every redirect hop and blocks a hop to an internal address", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data" });
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      // hop 0 (this server) is allowlisted so it passes; the redirect
      // target on hop 1 is not, so re-validation must still catch it.
      await expect(
        safeFetch(`http://127.0.0.1:${port}/`, { allowedHosts: ["127.0.0.1"] }),
      ).rejects.toBeInstanceOf(SsrfBlockedError);
    } finally {
      server.close();
    }
  });

  it("allows an explicitly allowlisted host (e.g. a configured Ollama/Piper base_url)", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const response = await safeFetch(`http://127.0.0.1:${port}/`, { allowedHosts: ["127.0.0.1"] });
      expect(response.ok).toBe(true);
      expect(await response.text()).toBe("ok");
    } finally {
      server.close();
    }
  });
});
