import { randomUUID } from "node:crypto";
import { TtsProviderError, type RelayDispatcher, type TtsSynthesizeRequest, type TtsSynthesizeResult, type TtsVoiceInfo } from "@distill/providers";
import { relayAgentMessageSchema, type RelayCloudMessage, type RelayTtsProviderKind } from "@distill/shared";
import type { WSContext } from "hono/ws";

// How long the cloud API waits for a dispatched job to come back before
// giving up. Longer than TTS_REQUEST_TIMEOUT_MS (60s, packages/providers/
// src/tts/models.ts) — the whole point of the relay is letting synthesis run
// on whatever consumer hardware a user happens to have, which can be slower
// than the sidecar containers that timeout was tuned around.
const JOB_TIMEOUT_MS = 180_000;

type PendingJob =
  | { kind: "synthesize"; provider: RelayTtsProviderKind; resolve: (r: TtsSynthesizeResult) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  | { kind: "listVoices"; provider: RelayTtsProviderKind; resolve: (r: TtsVoiceInfo[]) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

// One per connected relay agent (apps/relay-agent) — wraps its WebSocket and
// correlates outstanding jobs by id so multiple TTS requests for the same
// user can be in flight on the one socket concurrently.
class AgentConnection {
  private pending = new Map<string, PendingJob>();

  constructor(private readonly ws: WSContext) {}

  synthesize(provider: RelayTtsProviderKind, req: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new TtsProviderError(provider, "timeout", "Relay agent did not respond in time"));
      }, JOB_TIMEOUT_MS);
      this.pending.set(id, { kind: "synthesize", provider, resolve, reject, timer });
      this.sendJob({ type: "synthesize", id, provider, text: req.text, voice: req.voice, speed: req.speed });
    });
  }

  listVoices(provider: RelayTtsProviderKind): Promise<TtsVoiceInfo[]> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new TtsProviderError(provider, "timeout", "Relay agent did not respond in time"));
      }, JOB_TIMEOUT_MS);
      this.pending.set(id, { kind: "listVoices", provider, resolve, reject, timer });
      this.sendJob({ type: "listVoices", id, provider });
    });
  }

  private sendJob(message: RelayCloudMessage) {
    this.ws.send(JSON.stringify(message));
  }

  /** Feeds a raw frame received from the agent's socket back to whichever pending job it answers. Malformed or unrecognized frames are dropped, not thrown — a misbehaving agent shouldn't crash the API. */
  handleAgentFrame(raw: string) {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    const parsed = relayAgentMessageSchema.safeParse(json);
    if (!parsed.success) return;
    const msg = parsed.data;
    if (msg.type === "hello") return; // informational only, no pending job to resolve

    const job = this.pending.get(msg.id);
    if (!job) return; // late reply for a job we already timed out / duplicate frame

    this.pending.delete(msg.id);
    clearTimeout(job.timer);

    if (msg.type === "error") {
      job.reject(new TtsProviderError(job.provider, msg.code, msg.message));
      return;
    }
    if (msg.type === "synthesizeResult" && job.kind === "synthesize") {
      job.resolve({ audio: Buffer.from(msg.audioBase64, "base64"), format: msg.format, timings: null });
      return;
    }
    if (msg.type === "voicesResult" && job.kind === "listVoices") {
      job.resolve(msg.voices);
      return;
    }
    // A result frame answering the wrong kind of job — protocol mismatch, not a normal error.
    job.reject(new TtsProviderError(job.provider, "unknown", "Relay agent sent an unexpected response type"));
  }

  /** Fails every job still awaiting a reply — called when the socket closes so callers don't hang until JOB_TIMEOUT_MS. */
  rejectAllPending(reason: Error) {
    for (const job of this.pending.values()) {
      clearTimeout(job.timer);
      job.reject(reason);
    }
    this.pending.clear();
  }
}

// Single-process in-memory registry: one API instance, one connection per
// user (the relay agent is meant to run once per user's own machine). Mirrors
// the existing assumption that on-demand TTS generation runs synchronously
// in this same API process (docker-compose.yml's audio_storage volume
// comment) — there is no multi-instance API deployment to coordinate across.
class AgentRegistry {
  private connections = new Map<string, AgentConnection>();

  register(userId: string, ws: WSContext): AgentConnection {
    // A reconnect can arrive before the old socket's close event fires
    // (e.g. the agent's own reconnect-with-backoff outracing the server's
    // detection of the drop) — the new connection wins, and anything still
    // queued on the stale one fails immediately rather than hanging.
    this.connections.get(userId)?.rejectAllPending(new Error("Relay agent reconnected"));
    const connection = new AgentConnection(ws);
    this.connections.set(userId, connection);
    return connection;
  }

  unregister(userId: string, connection: AgentConnection) {
    if (this.connections.get(userId) === connection) {
      connection.rejectAllPending(new Error("Relay agent disconnected"));
      this.connections.delete(userId);
    }
  }

  get(userId: string): AgentConnection | undefined {
    return this.connections.get(userId);
  }

  isConnected(userId: string): boolean {
    return this.connections.has(userId);
  }
}

export const agentRegistry = new AgentRegistry();

// Implements the interface packages/providers/src/tts/index.ts calls into
// for a viaRelay credential — keeps that package free of any apps/api import.
export const relayDispatcher: RelayDispatcher = {
  synthesize(userId, provider, req) {
    const connection = agentRegistry.get(userId);
    if (!connection) return Promise.reject(new TtsProviderError(provider, "unavailable", "No relay agent is currently connected"));
    return connection.synthesize(provider, req);
  },
  listVoices(userId, provider) {
    const connection = agentRegistry.get(userId);
    if (!connection) return Promise.reject(new TtsProviderError(provider, "unavailable", "No relay agent is currently connected"));
    return connection.listVoices(provider);
  },
};
