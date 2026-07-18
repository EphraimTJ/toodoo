// Generates seamless ambient noise loops (white / pink / brown) as small mono
// WAV files for the focus feature. The tracks are procedurally synthesized, so
// they are original and free of any audio-licensing concerns (docs/decisions.md).
// Run: `node scripts/gen-ambient.mjs`
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 22_050;
const SECONDS = 6;
const FADE = Math.floor(RATE * 0.5); // 0.5s crossfade for a seamless loop
const L = RATE * SECONDS;

// Deterministic PRNG (mulberry32) so regeneration is stable.
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const white1 = (rand) => rand() * 2 - 1;

function generators() {
  const pinkState = [0, 0, 0, 0, 0, 0, 0];
  let brown = 0;
  return {
    white: (rand) => white1(rand) * 0.3,
    pink: (rand) => {
      const w = white1(rand);
      const b = pinkState;
      b[0] = 0.99886 * b[0] + w * 0.0555179;
      b[1] = 0.99332 * b[1] + w * 0.0750759;
      b[2] = 0.969 * b[2] + w * 0.153852;
      b[3] = 0.8665 * b[3] + w * 0.3104856;
      b[4] = 0.55 * b[4] + w * 0.5329522;
      b[5] = -0.7616 * b[5] - w * 0.016898;
      const out = b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362;
      b[6] = w * 0.115926;
      return out * 0.11;
    },
    brown: (rand) => {
      const w = white1(rand);
      brown = (brown + 0.02 * w) / 1.02;
      return brown * 3.5;
    },
  };
}

function buildLoop(kind, seed) {
  const rand = rng(seed);
  const gen = generators()[kind];
  const raw = new Float32Array(L + FADE);
  for (let i = 0; i < raw.length; i++) raw[i] = gen(rand);

  // Crossfade the tail back into the head so `<audio loop>` has no click.
  const out = new Float32Array(L);
  for (let i = 0; i < L; i++) {
    if (i < FADE) {
      const t = i / FADE;
      out[i] = raw[i] * t + raw[L + i] * (1 - t);
    } else {
      out[i] = raw[i];
    }
  }
  return out;
}

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

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "features", "focus", "assets", "ambient");
mkdirSync(outDir, { recursive: true });
for (const [kind, seed] of [["white", 1], ["pink", 2], ["brown", 3]]) {
  writeFileSync(join(outDir, `${kind}.wav`), toWav(buildLoop(kind, seed)));
  console.log(`wrote ${kind}.wav`);
}
