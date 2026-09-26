// Streaming downsampler: microphone rate (44.1/48 kHz) → 16 kHz mono signed 16-bit little-endian PCM,
// which is what Amazon Transcribe streaming expects. Box-filter averaging is plenty for speech recognition.

export class Downsampler {
  private readonly ratio: number;
  private carry: number[] = [];

  constructor(inputRate: number, private readonly outputRate = 16000) {
    this.ratio = inputRate / outputRate;
  }

  push(input: Float32Array): Int16Array {
    const samples = this.carry.length ? Float32Array.from([...this.carry, ...input]) : input;
    const outLength = Math.floor(samples.length / this.ratio);
    const out = new Int16Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const start = Math.floor(i * this.ratio);
      const end = Math.min(samples.length, Math.floor((i + 1) * this.ratio));
      let sum = 0;
      for (let j = start; j < end; j++) sum += samples[j];
      const v = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
      out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    const consumed = Math.floor(outLength * this.ratio);
    this.carry = Array.from(samples.subarray(consumed));
    return out;
  }
}

export function concatInt16(chunks: Int16Array[]): Int16Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Int16Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
