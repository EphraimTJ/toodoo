// Generates the "toodoo" notification chirp — a signature two-note descending
// birdlike "too-doo" motif (~0.5s), procedurally synthesized so it is original
// and free of audio-licensing concerns (like gen-ambient.mjs). Three variants
// are produced so the owner can pick one; the chosen variant is a setting and
// the asset path is swappable for a real recording later.
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
 * One birdlike note: fundamental + soft octave partial, fast attack,
 * exponential decay, and a slight downward pitch glide.
 */
function note(out, startSec, durSec, freq, { glide = 0.05, partial = 0.35, vibrato = 0 }) {
  const start = Math.floor(startSec * RATE);
  const n = Math.floor(durSec * RATE);
  let phase = 0;
  let phase2 = 0;
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / n;
    const sec = i / RATE;
    // Envelope: 8ms attack, exponential decay.
    const attack = Math.min(1, sec / 0.008);
    const decay = Math.exp(-t * 4.2);
    const env = attack * decay;
    // Downward glide (+ optional gentle vibrato) makes it read as a bird.
    const vib = vibrato ? 1 + vibrato * Math.sin(2 * Math.PI * 28 * sec) : 1;
    const f = freq * (1 - glide * t) * vib;
    phase += (2 * Math.PI * f) / RATE;
    phase2 += (2 * Math.PI * f * 2) / RATE;
    out[start + i] += env * (Math.sin(phase) + partial * Math.sin(phase2)) * 0.4;
  }
}

// Variant recipes: [too-note Hz, doo-note Hz, options]. All descend a fourth
// to a fifth — the "too-DOO" contour — with different brightness/character.
const VARIANTS = {
  "toodoo-1": (out) => {
    // Soft and round (recommended default).
    note(out, 0.0, 0.2, 1318, { glide: 0.05, partial: 0.25 });
    note(out, 0.24, 0.26, 988, { glide: 0.07, partial: 0.25 });
  },
  "toodoo-2": (out) => {
    // Brighter, slight vibrato on the second note — more "birdlike".
    note(out, 0.0, 0.18, 1568, { glide: 0.04, partial: 0.4 });
    note(out, 0.22, 0.28, 1175, { glide: 0.08, partial: 0.4, vibrato: 0.012 });
  },
  "toodoo-3": (out) => {
    // Mellow and low, longer tail.
    note(out, 0.0, 0.22, 1046, { glide: 0.05, partial: 0.18 });
    note(out, 0.26, 0.3, 784, { glide: 0.06, partial: 0.18 });
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
for (const [name, build] of Object.entries(VARIANTS)) {
  const samples = new Float32Array(Math.floor(RATE * 0.6));
  build(samples);
  writeFileSync(join(outDir, `${name}.wav`), toWav(samples));
  console.log(`wrote ${name}.wav`);
}
