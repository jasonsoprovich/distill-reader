import { createKokoroClient } from "@distill/providers/tts/kokoro.js";
import { createPiperClient } from "@distill/providers/tts/piper.js";
import {
  relayCloudMessageSchema,
  type RelayAgentMessage,
  type RelayTtsProviderKind,
} from "@distill/shared";
import WebSocket from "ws";

// Deep-imports @distill/providers/tts/{piper,kokoro}.js rather than the
// package root: the root barrel re-exports credentials.ts/tts/index.ts,
// which import @distill/db — and @distill/db throws at import time if
// DATABASE_URL isn't set (packages/db/src/client.ts). This agent has no
// business talking to Postgres at all, so it only pulls in the two
// self-contained HTTP clients it actually needs.

const CLOUD_URL = requireEnv("DISTILL_CLOUD_URL"); // e.g. wss://your-instance.example.com/relay/agent
const TOKEN = requireEnv("DISTILL_RELAY_TOKEN");
const PIPER_BASE_URL = process.env.PIPER_BASE_URL;
const KOKORO_BASE_URL = process.env.KOKORO_BASE_URL;
const AGENT_VERSION = "0.1.0";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const clients = {
  piper: PIPER_BASE_URL ? createPiperClient(PIPER_BASE_URL) : null,
  kokoro: KOKORO_BASE_URL ? createKokoroClient(KOKORO_BASE_URL) : null,
} satisfies Record<RelayTtsProviderKind, ReturnType<typeof createPiperClient> | null>;

function clientFor(provider: RelayTtsProviderKind) {
  const client = clients[provider];
  if (!client) throw new Error(`${provider.toUpperCase()}_BASE_URL is not configured on this agent`);
  return client;
}

function send(ws: WebSocket, message: RelayAgentMessage) {
  ws.send(JSON.stringify(message));
}

async function handleJob(ws: WebSocket, raw: unknown) {
  const parsed = relayCloudMessageSchema.safeParse(raw);
  if (!parsed.success) return; // ignore malformed frames from the cloud side

  const job = parsed.data;
  try {
    if (job.type === "synthesize") {
      const client = clientFor(job.provider);
      const result = await client.synthesize({ text: job.text, voice: job.voice, speed: job.speed });
      send(ws, { type: "synthesizeResult", id: job.id, audioBase64: result.audio.toString("base64"), format: result.format });
      return;
    }
    // job.type === "listVoices"
    const client = clientFor(job.provider);
    const voices = await client.listVoices();
    send(ws, { type: "voicesResult", id: job.id, voices });
  } catch (err) {
    const code = err instanceof Error && "code" in err && typeof err.code === "string" ? err.code : "unknown";
    const message = err instanceof Error ? err.message : String(err);
    send(ws, {
      type: "error",
      id: job.id,
      code: isKnownErrorCode(code) ? code : "unknown",
      message,
    });
  }
}

function isKnownErrorCode(code: string): code is "auth" | "rate_limit" | "timeout" | "empty_response" | "unknown" {
  return ["auth", "rate_limit", "timeout", "empty_response", "unknown"].includes(code);
}

// Reconnects with exponential backoff (capped) rather than crashing the
// process on a dropped connection — this is meant to run unattended
// (docker-compose relay-agent profile) on a machine the operator isn't
// watching.
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
let backoffMs = MIN_BACKOFF_MS;

function connect() {
  console.log(`Connecting to ${CLOUD_URL}...`);
  const ws = new WebSocket(CLOUD_URL, { headers: { Authorization: `Bearer ${TOKEN}` } });

  ws.on("open", () => {
    console.log("Connected to relay.");
    backoffMs = MIN_BACKOFF_MS;
    send(ws, { type: "hello", agentVersion: AGENT_VERSION });
  });

  ws.on("message", (data) => {
    let json: unknown;
    try {
      json = JSON.parse(data.toString());
    } catch {
      return;
    }
    void handleJob(ws, json);
  });

  ws.on("close", (code, reason) => {
    console.log(`Disconnected (${code}${reason ? `: ${reason}` : ""}); reconnecting in ${backoffMs}ms`);
    scheduleReconnect();
  });

  ws.on("error", (err) => {
    console.error("Relay connection error:", err.message);
  });
}

function scheduleReconnect() {
  setTimeout(connect, backoffMs);
  backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
}

if (!clients.piper && !clients.kokoro) {
  throw new Error("Set at least one of PIPER_BASE_URL / KOKORO_BASE_URL");
}

connect();
