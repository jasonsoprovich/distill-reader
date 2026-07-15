import { describe, expect, it } from "vitest";
import { concatMp3, concatWav } from "../src/tts/audio-concat.js";

function makeWav(data: Buffer, opts: { sampleRate?: number; channels?: number; bitsPerSample?: number } = {}): Buffer {
  const sampleRate = opts.sampleRate ?? 22050;
  const channels = opts.channels ?? 1;
  const bitsPerSample = opts.bitsPerSample ?? 16;
  const blockAlign = channels * (bitsPerSample / 8);

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

describe("concatWav", () => {
  it("returns a single chunk unchanged, with correct duration", () => {
    const data = Buffer.alloc(22050 * 2); // 1 second @ 22050Hz, 16-bit mono
    const wav = makeWav(data);
    const result = concatWav([wav]);
    expect(result.audio).toEqual(wav);
    expect(result.durationSeconds).toBeCloseTo(1, 5);
  });

  it("concatenates multiple chunks into one WAV with combined duration", () => {
    const dataA = Buffer.alloc(22050 * 2); // 1s
    const dataB = Buffer.alloc(22050); // 0.5s
    const result = concatWav([makeWav(dataA), makeWav(dataB)]);

    expect(result.durationSeconds).toBeCloseTo(1.5, 5);
    // Header (44 bytes) + both data payloads concatenated, no extra chunks.
    expect(result.audio.length).toBe(44 + dataA.length + dataB.length);
    expect(result.audio.toString("ascii", 36, 40)).toBe("data");
    expect(result.audio.readUInt32LE(40)).toBe(dataA.length + dataB.length);
  });

  it("preserves sample rate/channels/bit depth from the first chunk in the rebuilt header", () => {
    const wav = makeWav(Buffer.alloc(100), { sampleRate: 24000, channels: 2, bitsPerSample: 8 });
    const result = concatWav([wav, makeWav(Buffer.alloc(50), { sampleRate: 24000, channels: 2, bitsPerSample: 8 })]);
    expect(result.audio.readUInt32LE(24)).toBe(24000);
    expect(result.audio.readUInt16LE(22)).toBe(2);
    expect(result.audio.readUInt16LE(34)).toBe(8);
  });

  it("throws on a non-WAV buffer", () => {
    expect(() => concatWav([Buffer.from("not a wav file")])).toThrow(/valid WAV/);
  });
});

describe("concatMp3", () => {
  it("returns a single chunk unchanged", () => {
    const chunk = Buffer.from([1, 2, 3]);
    expect(concatMp3([chunk])).toBe(chunk);
  });

  it("byte-concatenates multiple chunks in order", () => {
    const a = Buffer.from([1, 2]);
    const b = Buffer.from([3, 4]);
    expect(concatMp3([a, b])).toEqual(Buffer.from([1, 2, 3, 4]));
  });
});
