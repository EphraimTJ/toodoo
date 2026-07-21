// Generates Toodoo's notification sounds — a small, cohesive family, all
// procedurally synthesized (original, free of audio-licensing concerns) from
// one soft "birdlike" note primitive. Distinct contours signal distinct events:
//   reminder (too-doo)  — gentle descending nudge for a due task (3 variants)
//   habit               — bright ASCENDING motif: encouraging, "keep the streak"
//   focus-done          — celebratory rising arpeggio: a work session completed
//   break-over          — soft two-note nudge back to focus
// Run: `node scripts/gen-chirp.mjs`
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 22_050;

function toWav(samples) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(RATE, 24);
  buffer.writeUInt32LE(RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buffer;
}

/**
 * One soft note: fundamental + octave partial, fast attack, exponential decay,
 * optional downward glide and gentle vibrato. `decayRate` lets bell-like notes
 * ring longer.
 */
function note(out, startSec, durSec, freq, opts = {}) {
  const { glide = 0.05, partial = 0.35, vibrato = 0, decayRate = 4.2, gain = 0.4 } = opts;
  const start = Math.floor(startSec * RATE);
  const n = Math.floor(durSec * RATE);
  let phase = 0;
  let phase2 = 0;
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / n;
    const sec = i / RATE;
    const attack = Math.min(1, sec / 0.008);
    const decay = Math.exp(-t * decayRate);
    const env = attack * decay;
    const vib = vibrato ? 1 + vibrato * Math.sin(2 * Math.PI * 28 * sec) : 1;
    const f = freq * (1 - glide * t) * vib;
    phase += (2 * Math.PI * f) / RATE;
    phase2 += (2 * Math.PI * f * 2) / RATE;
    out[start + i] += env * (Math.sin(phase) + partial * Math.sin(phase2)) * gain;
  }
}

// [name] -> { dur (seconds), build(samples) }
const SOUNDS = {
  // --- Task reminder: gentle descending "too-DOO" (pick one; a setting) ---
  "toodoo-1": {
    dur: 0.6,
    build: (o) => {
      note(o, 0.0, 0.2, 1318, { glide: 0.05, partial: 0.25 });
      note(o, 0.24, 0.26, 988, { glide: 0.07, partial: 0.25 });
    },
  },
  "toodoo-2": {
    dur: 0.6,
    build: (o) => {
      note(o, 0.0, 0.18, 1568, { glide: 0.04, partial: 0.4 });
      note(o, 0.22, 0.28, 1175, { glide: 0.08, partial: 0.4, vibrato: 0.012 });
    },
  },
  "toodoo-3": {
    dur: 0.6,
    build: (o) => {
      note(o, 0.0, 0.22, 1046, { glide: 0.05, partial: 0.18 });
      note(o, 0.26, 0.3, 784, { glide: 0.06, partial: 0.18 });
    },
  },
  // --- Habit reminder: bright ASCENDING fourth — warm and encouraging ---
  habit: {
    dur: 0.72,
    build: (o) => {
      note(o, 0.0, 0.2, 784, { glide: 0.02, partial: 0.3 }); // G5
      note(o, 0.2, 0.42, 1046, { glide: 0.01, partial: 0.35, vibrato: 0.01, decayRate: 3.2 }); // C6, held
    },
  },
  // --- Focus session complete: rising C-major arpeggio, last note rings ---
  "focus-done": {
    dur: 1.25,
    build: (o) => {
      note(o, 0.0, 0.16, 523, { glide: 0.01, partial: 0.3 }); // C5
      note(o, 0.15, 0.16, 659, { glide: 0.01, partial: 0.3 }); // E5
      note(o, 0.3, 0.18, 784, { glide: 0.01, partial: 0.3 }); // G5
      note(o, 0.46, 0.75, 1046, { glide: 0.005, partial: 0.4, decayRate: 2.0, vibrato: 0.006 }); // C6, bell tail
    },
  },
  // --- Break over: soft two-note nudge back to work ---
  "break-over": {
    dur: 0.6,
    build: (o) => {
      note(o, 0.0, 0.2, 659, { glide: 0.03, partial: 0.2, gain: 0.32 }); // E5
      note(o, 0.2, 0.3, 880, { glide: 0.03, partial: 0.2, gain: 0.32, decayRate: 3.4 }); // A5
    },
  },
};

const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "features",
  "reminders",
  "assets",
  "chirp",
);
mkdirSync(outDir, { recursive: true });
for (const [name, { dur, build }] of Object.entries(SOUNDS)) {
  const samples = new Float32Array(Math.floor(RATE * dur));
  build(samples);
  writeFileSync(join(outDir, `${name}.wav`), toWav(samples));
  console.log(`wrote ${name}.wav`);
}
