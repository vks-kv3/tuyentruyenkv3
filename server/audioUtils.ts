import fs from 'fs';

const SAMPLE_RATE = 24000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

export function createWavHeader(dataByteLength: number, sampleRate = SAMPLE_RATE, channels = CHANNELS): Buffer {
  const header = Buffer.alloc(44);
  const blockAlign = channels * (BITS_PER_SAMPLE / 8);
  const byteRate = sampleRate * blockAlign;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataByteLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataByteLength, 40);

  return header;
}

export function readWavInfo(wavBuffer: Buffer): {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
  durationSec: number;
} {
  if (wavBuffer.length < 44 || wavBuffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Dữ liệu âm thanh WAV không hợp lệ.');
  }
  const channels = wavBuffer.readUInt16LE(22) || 1;
  const sampleRate = wavBuffer.readUInt32LE(24) || SAMPLE_RATE;
  const bitsPerSample = wavBuffer.readUInt16LE(34) || 16;

  // Locate 'data' chunk robustly
  let offset = 12;
  let dataOffset = 44;
  let dataSize = wavBuffer.length - 44;
  while (offset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = Math.min(chunkSize, wavBuffer.length - dataOffset);
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const durationSec = byteRate > 0 ? dataSize / byteRate : 0;

  return { sampleRate, channels, bitsPerSample, dataOffset, dataSize, durationSec };
}

/**
 * Resamples mono 16-bit PCM linearly if a WAV clip differs from targetSampleRate (24kHz).
 */
function extractMonoPcm24k(wavBuffer: Buffer): Int16Array {
  const info = readWavInfo(wavBuffer);
  const sampleCount = Math.floor(info.dataSize / (info.channels * 2));
  const mono = new Int16Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    let sum = 0;
    for (let c = 0; c < info.channels; c++) {
      const idx = info.dataOffset + (i * info.channels + c) * 2;
      if (idx + 1 < wavBuffer.length) {
        sum += wavBuffer.readInt16LE(idx);
      }
    }
    mono[i] = Math.round(sum / info.channels);
  }

  if (info.sampleRate === SAMPLE_RATE) {
    return mono;
  }

  const ratio = info.sampleRate / SAMPLE_RATE;
  const targetLen = Math.max(1, Math.floor(sampleCount / ratio));
  const resampled = new Int16Array(targetLen);
  for (let i = 0; i < targetLen; i++) {
    const srcPos = i * ratio;
    const idx0 = Math.floor(srcPos);
    const idx1 = Math.min(sampleCount - 1, idx0 + 1);
    const frac = srcPos - idx0;
    resampled[i] = Math.round(mono[idx0] * (1 - frac) + mono[idx1] * frac);
  }
  return resampled;
}

export interface TimelineAudioClip {
  wavPath?: string;
  startSec: number;
  durationSec: number;
}

/**
 * Builds one continuous 24kHz mono WAV voiceover master aligned to exact scene timestamps.
 */
export function buildMasterVoiceoverWav(
  clips: TimelineAudioClip[],
  totalDurationSec: number,
  outWavPath: string
): void {
  const totalSamples = Math.max(SAMPLE_RATE, Math.ceil(totalDurationSec * SAMPLE_RATE));
  const master = new Int16Array(totalSamples);

  for (const clip of clips) {
    if (!clip.wavPath || !fs.existsSync(clip.wavPath)) continue;
    const buf = fs.readFileSync(clip.wavPath);
    const pcm = extractMonoPcm24k(buf);
    // Start narration ~0.25s after scene transition for clean broadcast pacing
    const startSample = Math.max(0, Math.round((clip.startSec + 0.2) * SAMPLE_RATE));
    const maxSamplesInScene = Math.max(0, Math.round((clip.durationSec - 0.1) * SAMPLE_RATE));
    const copyLen = Math.min(pcm.length, maxSamplesInScene, totalSamples - startSample);

    for (let i = 0; i < copyLen; i++) {
      const mixed = master[startSample + i] + pcm[i];
      master[startSample + i] = Math.max(-32768, Math.min(32767, mixed));
    }
  }

  const dataBuffer = Buffer.from(master.buffer, master.byteOffset, master.byteLength);
  const header = createWavHeader(dataBuffer.length, SAMPLE_RATE, 1);
  fs.writeFileSync(outWavPath, Buffer.concat([header, dataBuffer]));
}

/**
 * Synthesizes a dignified, subtle newsroom instrumental background bed (24kHz mono 16-bit WAV).
 * Features warm orchestral string-pad fifths + gentle rhythmic institutional pulse,
 * with smooth fade-in and fade-out.
 */
export function generateNewsroomBgmWav(totalDurationSec: number, outWavPath: string): void {
  const totalSamples = Math.max(SAMPLE_RATE, Math.ceil(totalDurationSec * SAMPLE_RATE));
  const pcm = new Int16Array(totalSamples);

  // Formal Vietnamese institutional broadcast chord progression (C major -> G/B -> Am7 -> Fmaj7)
  // 4-second chord cycle (16 seconds full loop)
  const chords = [
    [130.81, 196.0, 261.63, 329.63], // C3, G3, C4, E4
    [123.47, 196.0, 246.94, 293.66], // B2, G3, B3, D4
    [110.0, 164.81, 220.0, 261.63],  // A2, E3, A3, C4
    [87.31, 174.61, 220.0, 261.63],  // F2, F3, A3, C4
  ];

  const chordDuration = 4.0;
  const fadeInSec = 1.2;
  const fadeOutSec = Math.min(3.0, Math.max(1.5, totalDurationSec * 0.15));

  for (let i = 0; i < totalSamples; i++) {
    const t = i / SAMPLE_RATE;
    const chordIdx = Math.floor(t / chordDuration) % chords.length;
    const nextChordIdx = (chordIdx + 1) % chords.length;
    const chordLocalT = t % chordDuration;

    // Crossfade smoothly between chords over 0.6s at boundary
    const blend = chordLocalT > chordDuration - 0.6 ? (chordLocalT - (chordDuration - 0.6)) / 0.6 : 0;

    let pad = 0;
    const curNotes = chords[chordIdx];
    const nxtNotes = chords[nextChordIdx];

    for (let n = 0; n < curNotes.length; n++) {
      const f1 = curNotes[n];
      const f2 = nxtNotes[n];
      // Warm soft harmonic pad (fundamental + gentle 2nd harmonic)
      const s1 = Math.sin(2 * Math.PI * f1 * t) * 0.75 + Math.sin(2 * Math.PI * f1 * 2 * t) * 0.12;
      const s2 = Math.sin(2 * Math.PI * f2 * t) * 0.75 + Math.sin(2 * Math.PI * f2 * 2 * t) * 0.12;
      pad += (s1 * (1 - blend) + s2 * blend) * 0.22;
    }

    // Gentle broadcast newsroom pulse every 0.5s (120 BPM subtle marimba/bell accent)
    const beatT = t % 0.5;
    const beatIdx = Math.floor(t / 0.5) % 8;
    const pulseFreq = beatIdx % 2 === 0 ? 523.25 : 392.0; // C5 / G4
    const pulseEnv = Math.exp(-beatT * 10.5);
    const pulse = Math.sin(2 * Math.PI * pulseFreq * t) * pulseEnv * 0.14;

    // Master envelope
    let env = 1.0;
    if (t < fadeInSec) {
      env = t / fadeInSec;
    } else if (t > totalDurationSec - fadeOutSec) {
      env = Math.max(0, (totalDurationSec - t) / fadeOutSec);
    }

    // Keep peak clean around -10 dBFS (will be ducked further during mixing)
    const sample = (pad + pulse) * env * 0.35;
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
  }

  const dataBuffer = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const header = createWavHeader(dataBuffer.length, SAMPLE_RATE, 1);
  fs.writeFileSync(outWavPath, Buffer.concat([header, dataBuffer]));
}
