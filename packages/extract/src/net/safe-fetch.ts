import { lookup } from "node:dns/promises";
import { USER_AGENT } from "@distill/shared";
import { isBlockedAddress } from "./ssrf.js";

export class SafeFetchError extends Error {}
export class SsrfBlockedError extends SafeFetchError {}
export class ResponseTooLargeError extends SafeFetchError {}

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  timeoutMs?: number;
  maxRedirects?: number;
  // Known internal sidecar hosts (Ollama/Piper base_url) that are a
  // deliberate, configured exception to the private-range block (§10.2).
  allowedHosts?: string[];
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 5;
export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

function isLiteralIp(hostname: string): boolean {
  return hostname.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

// Resolves `hostname` and rejects if any resolved address is private/
// loopback/link-local/metadata. Re-run on every redirect hop below, since
// each hop is a fresh, potentially attacker-controlled host. Note: this
// validates-then-connects rather than pinning the fetch to the resolved
// address, so it does not fully close a DNS-rebinding race between the
// check and the connect — network-segmenting the worker's egress (§10.2)
// is the belt to this suspenders.
async function assertHostIsSafe(hostname: string, allowedHosts?: string[]): Promise<void> {
  if (allowedHosts?.includes(hostname)) return;

  if (isLiteralIp(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw new SsrfBlockedError(`Blocked address: ${hostname}`);
    }
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SsrfBlockedError(`DNS resolution failed for host: ${hostname}`);
  }
  if (addresses.length === 0) {
    throw new SsrfBlockedError(`No addresses resolved for host: ${hostname}`);
  }
  for (const { address } of addresses) {
    if (isBlockedAddress(address)) {
      throw new SsrfBlockedError(`Host ${hostname} resolves to blocked address ${address}`);
    }
  }
}

/**
 * fetch() with SSRF protection: scheme allowlist, DNS-resolved IP-range
 * blocking, and a redirect cap that re-validates every hop. Returns the
 * final Response with its body unread — use readCapped() to consume it
 * under a size limit.
 */
export async function safeFetch(inputUrl: string, opts: SafeFetchOptions = {}): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let currentUrl = inputUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const parsed = new URL(currentUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new SafeFetchError(`Unsupported scheme: ${parsed.protocol}`);
    }

    await assertHostIsSafe(parsed.hostname, opts.allowedHosts);

    const response = await fetch(currentUrl, {
      method: opts.method ?? "GET",
      headers: { "User-Agent": USER_AGENT, ...opts.headers },
      body: opts.body,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return response;
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return response;
  }
  throw new SafeFetchError(`Too many redirects fetching ${inputUrl}`);
}

/** Reads a Response body into a Buffer, aborting once it exceeds maxBytes. */
export async function readCapped(
  response: Response,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<Buffer> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new ResponseTooLargeError(`Content-Length ${contentLength} exceeds cap of ${maxBytes}`);
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ResponseTooLargeError(`Response body exceeded ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
