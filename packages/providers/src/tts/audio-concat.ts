interface WavChunkInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
}

// Scans RIFF chunks generically (rather than assuming fixed offsets) so it
// tolerates any well-formed WAV, not just the minimal one piper.http_server
// happens to emit today.
function parseWav(buf: Buffer): WavChunkInfo {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Not a valid WAV file");
  }

  let offset = 12;
  let fmt: { channels: number; sampleRate: number; bitsPerSample: number } | null = null;
  let dataOffset = -1;
  let dataLength = 0;

  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;

    if (chunkId === "fmt ") {
      fmt = {
        channels: buf.readUInt16LE(bodyStart + 2),
        sampleRate: buf.readUInt32LE(bodyStart + 4),
        bitsPerSample: buf.readUInt16LE(bodyStart + 14),
      };
    } else if (chunkId === "data") {
      dataOffset = bodyStart;
      dataLength = chunkSize;
    }

    // Chunks are word-aligned: an odd-sized chunk has one byte of padding.
    offset = bodyStart + chunkSize + (chunkSize % 2);
  }

  if (!fmt || dataOffset < 0) throw new Error("WAV file is missing a fmt or data chunk");
  return { ...fmt, dataOffset, dataLength };
}

function buildWavHeader(dataLength: number, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataLength, 40);
  return header;
}

/**
 * Concatenates one or more WAV buffers (PLAN §7.2's "split... synthesize
 * sequentially, concatenate") into a single canonical WAV, assuming they
 * share the same sample rate/channels/bit depth — true here since every
 * chunk in one request comes from the same provider+voice+settings call.
 */
export function concatWav(chunks: Buffer[]): { audio: Buffer; durationSeconds: number } {
  const infos = chunks.map(parseWav);
  const { sampleRate, channels, bitsPerSample } = infos[0];
  const dataParts = chunks.map((buf, i) => buf.subarray(infos[i].dataOffset, infos[i].dataOffset + infos[i].dataLength));
  const totalDataLength = dataParts.reduce((sum, part) => sum + part.length, 0);
  const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);

  if (chunks.length === 1) {
    return { audio: chunks[0], durationSeconds: totalDataLength / bytesPerSecond };
  }

  const header = buildWavHeader(totalDataLength, sampleRate, channels, bitsPerSample);
  return { audio: Buffer.concat([header, ...dataParts]), durationSeconds: totalDataLength / bytesPerSecond };
}

/**
 * MP3 frames are independently decodable, so byte-concatenation plays back
 * correctly in virtually every decoder without re-muxing — this is the
 * standard low-effort trick for stitching MP3 chunks. We don't parse frame
 * headers here, so duration isn't derived from the bytes; the caller (which
 * has ElevenLabs' per-chunk character timings) computes it from those instead.
 */
export function concatMp3(chunks: Buffer[]): Buffer {
  return chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
}
