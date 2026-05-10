#!/usr/bin/env node
/**
 * Shardtown launch sound — v2: cinematic bell hit, not arpeggio.
 *
 * Design:
 * - Sub-bass impact at t=0 (55Hz sine, short envelope) — gives the
 *   physical "thwomp" feel of a movie logo intro before any tone hits.
 * - Cmaj9 chord struck like a bell. Each note is rendered with bell-like
 *   additive synthesis: fundamental + slightly inharmonic partials at
 *   2x, 3.01x, 4.07x, 5.10x with their own decay rates so the high
 *   partials fade fast and you're left with a deep ringing fundamental.
 * - Notes hit with tiny staggers (4–20ms) so the chord "blooms" instead
 *   of being a flat block; mimics a real piano/bell where strings ring
 *   slightly out of phase.
 * - Total ~3s with a long natural decay; the boot screen is 2.4s so
 *   the tail bleeds into the login screen for a smooth handoff.
 *
 * Run: node scripts/gen-launch-sound.cjs
 * Output: public/sounds/shardtown-launch.wav
 */

const fs = require("fs");
const path = require("path");

const SAMPLE_RATE = 44100;
const DURATION = 3.0;
const N = Math.floor(SAMPLE_RATE * DURATION);

const samples = new Float32Array(N);

/** Bell-like additive synthesis voice, hit at `start`, frequency `f`. */
function addBellVoice(start, f, amp) {
  // Inharmonic partials — natural bells aren't pure integer multiples,
  // and the slight offset is what gives the "metallic shimmer".
  const partials = [
    { ratio: 1.00, amp: 1.00, decay: 2.4 },
    { ratio: 2.00, amp: 0.42, decay: 1.7 },
    { ratio: 3.01, amp: 0.28, decay: 1.1 },
    { ratio: 4.07, amp: 0.18, decay: 0.7 },
    { ratio: 5.10, amp: 0.10, decay: 0.4 },
  ];
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    // Tiny attack ramp (3ms) so we don't click on the front.
    const attack = t < 0.003 ? t / 0.003 : 1;
    let s = 0;
    for (const p of partials) {
      s += p.amp * Math.exp(-t / p.decay) * Math.sin(2 * Math.PI * f * p.ratio * t);
    }
    samples[i] += s * amp * attack;
  }
}

/** Sub-bass impact at t=0 — the physical "punch" before the chord rings. */
function addImpact() {
  const f = 55; // A1, deep
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    if (t > 0.4) break;
    const env = t < 0.003 ? t / 0.003 : Math.exp(-t / 0.08);
    // Pitch envelope — starts at 1.5x freq, drops to f. Adds the "drop" feel.
    const pitched = f * (1 + 0.5 * Math.exp(-t / 0.05));
    samples[i] += 0.55 * env * Math.sin(2 * Math.PI * pitched * t);
  }
}

addImpact();

// Cmaj9: C2 - C3 - E3 - G3 - B3 - D4
// Staggered hits so the chord blooms instead of stacking flat.
const chord = [
  { f:  65.41, start: 0.00, amp: 0.18 }, // C2  bass
  { f: 130.81, start: 0.00, amp: 0.20 }, // C3
  { f: 164.81, start: 0.04, amp: 0.18 }, // E3
  { f: 196.00, start: 0.08, amp: 0.18 }, // G3
  { f: 246.94, start: 0.13, amp: 0.16 }, // B3
  { f: 293.66, start: 0.20, amp: 0.14 }, // D4
];
for (const n of chord) addBellVoice(n.start, n.f, n.amp);

// Soft fade-out over the last 400ms to avoid a hard sample-end click.
const fadeStart = Math.floor((DURATION - 0.4) * SAMPLE_RATE);
for (let i = fadeStart; i < N; i++) {
  const k = (N - i) / (N - fadeStart);
  samples[i] *= k;
}

// Soft limiter — anything above 0.95 gets gently squashed instead of clipped.
for (let i = 0; i < N; i++) {
  const v = samples[i];
  if (v > 0.95) samples[i] = 0.95 + (v - 0.95) * 0.1;
  else if (v < -0.95) samples[i] = -0.95 + (v + 0.95) * 0.1;
}

// 16-bit mono PCM WAV header
const HEADER_LEN = 44;
const buf = Buffer.alloc(HEADER_LEN + N * 2);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + N * 2, 4);
buf.write("WAVE", 8);
buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(SAMPLE_RATE, 24);
buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
buf.writeUInt16LE(2, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(N * 2, 40);

for (let i = 0; i < N; i++) {
  const v = Math.max(-1, Math.min(1, samples[i]));
  buf.writeInt16LE(Math.round(v * 32767), HEADER_LEN + i * 2);
}

const out = path.resolve(__dirname, "..", "public", "sounds", "shardtown-launch.wav");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buf);
console.log(`wrote ${out} (${(buf.length / 1024).toFixed(1)} KB, ${DURATION}s @ ${SAMPLE_RATE}Hz)`);
