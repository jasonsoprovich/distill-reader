import { describe, expect, it } from "vitest";
import {
  relayAgentMessageSchema,
  relayCloudMessageSchema,
  relayErrorMessageSchema,
  relayHelloMessageSchema,
  relayListVoicesJobSchema,
  relaySynthesizeJobSchema,
  relaySynthesizeResultSchema,
  relayVoicesResultSchema,
} from "../src/relay-protocol.js";

describe("relayCloudMessageSchema (cloud -> agent)", () => {
  it("round-trips a synthesize job", () => {
    const msg = { type: "synthesize", id: "job-1", provider: "kokoro", text: "hello", voice: "af_heart", speed: 1 };
    expect(relayCloudMessageSchema.parse(msg)).toEqual(msg);
    expect(relaySynthesizeJobSchema.safeParse(msg).success).toBe(true);
  });

  it("round-trips a listVoices job", () => {
    const msg = { type: "listVoices", id: "job-2", provider: "piper" };
    expect(relayCloudMessageSchema.parse(msg)).toEqual(msg);
    expect(relayListVoicesJobSchema.safeParse(msg).success).toBe(true);
  });

  it("rejects a provider outside RELAY_TTS_PROVIDERS (e.g. cloud-only elevenlabs)", () => {
    const msg = { type: "synthesize", id: "job-3", provider: "elevenlabs", text: "hi", voice: "x", speed: 1 };
    expect(relayCloudMessageSchema.safeParse(msg).success).toBe(false);
  });

  it("rejects speed outside the 0.5-2 range", () => {
    const msg = { type: "synthesize", id: "job-4", provider: "piper", text: "hi", voice: "x", speed: 3 };
    expect(relayCloudMessageSchema.safeParse(msg).success).toBe(false);
  });

  it("rejects an unknown message type", () => {
    expect(relayCloudMessageSchema.safeParse({ type: "shutdown", id: "x" }).success).toBe(false);
  });
});

describe("relayAgentMessageSchema (agent -> cloud)", () => {
  it("round-trips a synthesizeResult", () => {
    const msg = { type: "synthesizeResult", id: "job-1", audioBase64: "aGVsbG8=", format: "mp3" };
    expect(relayAgentMessageSchema.parse(msg)).toEqual(msg);
    expect(relaySynthesizeResultSchema.safeParse(msg).success).toBe(true);
  });

  it("round-trips a voicesResult", () => {
    const msg = { type: "voicesResult", id: "job-2", voices: [{ id: "af_heart", name: "af_heart" }] };
    expect(relayAgentMessageSchema.parse(msg)).toEqual(msg);
    expect(relayVoicesResultSchema.safeParse(msg).success).toBe(true);
  });

  it("round-trips an error message", () => {
    const msg = { type: "error", id: "job-3", code: "timeout", message: "took too long" };
    expect(relayAgentMessageSchema.parse(msg)).toEqual(msg);
    expect(relayErrorMessageSchema.safeParse(msg).success).toBe(true);
  });

  it("round-trips a hello message", () => {
    const msg = { type: "hello", agentVersion: "0.1.0" };
    expect(relayAgentMessageSchema.parse(msg)).toEqual(msg);
    expect(relayHelloMessageSchema.safeParse(msg).success).toBe(true);
  });

  it("rejects an error message with an unrecognized code", () => {
    const msg = { type: "error", id: "job-4", code: "teapot", message: "nope" };
    expect(relayAgentMessageSchema.safeParse(msg).success).toBe(false);
  });

  it("rejects an empty audioBase64", () => {
    const msg = { type: "synthesizeResult", id: "job-5", audioBase64: "", format: "mp3" };
    expect(relayAgentMessageSchema.safeParse(msg).success).toBe(false);
  });
});
