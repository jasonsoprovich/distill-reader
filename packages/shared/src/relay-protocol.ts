import { z } from "zod";
import { RELAY_TTS_PROVIDERS } from "./types.js";

// Wire protocol for the WebSocket between the cloud API (apps/api's
// /relay/agent route) and a user-run relay agent (apps/relay-agent).
// Transport-level auth (the pairing token) happens once, at connect time,
// via an Authorization header on the upgrade request — it never appears in
// these message bodies. Every request/response pair is correlated by a
// shared `id` (the cloud API mints it per job; the agent echoes it back
// unchanged), since one socket carries every in-flight job for that user
// concurrently.

export const relaySynthesizeJobSchema = z.object({
  type: z.literal("synthesize"),
  id: z.string().min(1),
  provider: z.enum(RELAY_TTS_PROVIDERS),
  text: z.string().min(1),
  voice: z.string().min(1),
  speed: z.number().min(0.5).max(2),
});
export type RelaySynthesizeJob = z.infer<typeof relaySynthesizeJobSchema>;

export const relayListVoicesJobSchema = z.object({
  type: z.literal("listVoices"),
  id: z.string().min(1),
  provider: z.enum(RELAY_TTS_PROVIDERS),
});
export type RelayListVoicesJob = z.infer<typeof relayListVoicesJobSchema>;

// Cloud -> agent.
export const relayCloudMessageSchema = z.discriminatedUnion("type", [
  relaySynthesizeJobSchema,
  relayListVoicesJobSchema,
]);
export type RelayCloudMessage = z.infer<typeof relayCloudMessageSchema>;

const relayErrorCodeSchema = z.enum(["auth", "rate_limit", "timeout", "empty_response", "unknown"]);

export const relaySynthesizeResultSchema = z.object({
  type: z.literal("synthesizeResult"),
  id: z.string().min(1),
  // Raw audio bytes don't survive JSON directly, so the agent base64-encodes
  // them for this frame; the API decodes back to a Buffer on receipt.
  audioBase64: z.string().min(1),
  format: z.string().min(1),
});
export type RelaySynthesizeResult = z.infer<typeof relaySynthesizeResultSchema>;

export const relayVoicesResultSchema = z.object({
  type: z.literal("voicesResult"),
  id: z.string().min(1),
  voices: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type RelayVoicesResult = z.infer<typeof relayVoicesResultSchema>;

export const relayErrorMessageSchema = z.object({
  type: z.literal("error"),
  id: z.string().min(1),
  code: relayErrorCodeSchema,
  message: z.string().min(1),
});
export type RelayErrorMessage = z.infer<typeof relayErrorMessageSchema>;

// Sent once, unprompted, right after a successful connect — informational
// only (surfaced as agent metadata in Settings), not part of auth.
export const relayHelloMessageSchema = z.object({
  type: z.literal("hello"),
  agentVersion: z.string().min(1),
});
export type RelayHelloMessage = z.infer<typeof relayHelloMessageSchema>;

// Agent -> cloud.
export const relayAgentMessageSchema = z.discriminatedUnion("type", [
  relaySynthesizeResultSchema,
  relayVoicesResultSchema,
  relayErrorMessageSchema,
  relayHelloMessageSchema,
]);
export type RelayAgentMessage = z.infer<typeof relayAgentMessageSchema>;
