#!/usr/bin/env node
/**
 * Shardtown launch sound — v5: clean pad chord, nothing else.
 *
 * Previous versions (bells, sub impact, noise shimmer) sounded synthetic
 * and overengineered. This one strips back to a single idea: a soft pad
 * chord swelling in, holding, fading out, drowned in reverb. Like the
 * BBC iPlayer or Linear app launch — confident in its restraint.
 *
 * - Cmaj7 voicing across two octaves (C3 E3 G3 B3 + C4 E4 G4) for body.
 * - Each voice is pure sine + 2nd + 3rd harmonic at decreasing amps —
 *   integer ratios only, no inharmonic content, so it sounds like a
 *   warm organ/pad, never like a glass bell.
 * - Tiny per-voice detuning (0.4 cents) for natural chorus warmth.
 * - 1.0s ease-in attack, 1.0s hold, 1.5s ease-out tail.
 * - Long stereo reverb (2 stacked schroeder-style allpass + comb filters).
 * - Soft tanh saturation on the master, exponential fade-out.
 *
 * Run: node scripts/gen-launch-sound.cjs
 * Output: public/sounds/shardtown-launch.wav
 */

const fs = require("fs");
const path = require("path");

const SAMPLE_RATE = 44100;
const DURATION = 3.5;
const N = Math.floor(SAMPLE_RATE * DURATION);

const ATTACK = 1.0;
const HOLD = 1.0;
// Release auto-computed from DURATION.

const left = new Float32Array(N);
const right = new Float32Array(N);

/** Smooth ADSR-ish envelope: ease-in attack, sustain at 1.0, ease-out. */
function envelope(t) {
  if (t < 0) return 0;
  if (t < ATTACK) {
    const k = t / ATTACK;
    return k * k * (3 - 2 * k); // smoothstep
  }
  if (t < ATTACK + HOLD) return 1;
  const releaseStart = ATTACK + HOLD;
  const releaseLen = DURATION - releaseStart;
  const k = (t - releaseStart) / releaseLen;
  if (k >= 1) return 0;
  // ease-out cubic — slow start of the fade, fast at the very end so the
  // tail dies gently in your ears, not abruptly.
  const inv = 1 - k;
  return inv * inv * inv;
}

function pan(p, s, leftBuf, rightBuf, i) {
  const l = Math.cos((p + 1) * Math.PI / 4);
  const r = Math.sin((p + 1) * Math.PI / 4);
  leftBuf[i] += s * l;
  rightBuf[i] += s * r;
}

/** Pure-harmonic pad voice. No inharmonic content, no FM, no detuned saw. */
function addPadVoice(f, amp, panning) {
  // Two oscillators detuned by ±0.4 cents (~0.023%) for chorus warmth
  const detune = 0.00023;
  const f1 = f * (1 - detune);
  const f2 = f * (1 + detune);
  // Integer harmonics, smoothly rolling off. No 5x+ — keeps it warm,
  // not bright/synthy.
  const partials = [
    { ratio: 1, amp: 1.00 },
    { ratio: 2, amp: 0.30 },
    { ratio: 3, amp: 0.10 },
  ];
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t);
    if (env < 0.0005) continue;
    let s = 0;
    for (const p of partials) {
      s += p.amp * 0.5 * (
        Math.sin(2 * Math.PI * f1 * p.ratio * t)
      + Math.sin(2 * Math.PI * f2 * p.ratio * t)
      );
    }
    pan(panning, s * amp * env, left, right, i);
  }
}

/* Cmaj7 spread across 2 octaves. Pan widens with frequency for a natural
   "lower notes centered, upper notes outboard" stage feel. */
const chord = [
  { f: 130.81, amp: 0.18, pan:  0.00 }, // C3 (anchor bass)
  { f: 164.81, amp: 0.16, pan: -0.20 }, // E3
  { f: 196.00, amp: 0.16, pan:  0.20 }, // G3
  { f: 246.94, amp: 0.14, pan: -0.40 }, // B3
  { f: 261.63, amp: 0.14, pan:  0.00 }, // C4
  { f: 329.63, amp: 0.12, pan:  0.40 }, // E4
  { f: 392.00, amp: 0.10, pan: -0.55 }, // G4
];
for (const n of chord) addPadVoice(n.f, n.amp, n.pan);

/* ─── Schroeder-style reverb: parallel comb filters → series allpass ── */
function combFilter(buf, delaySec, feedback, damping) {
  const ds = Math.floor(delaySec * SAMPLE_RATE);
  const out = new Float32Array(N);
  const memory = new Float32Array(ds);
  let mi = 0;
  let lp = 0;
  for (let i = 0; i < N; i++) {
    const sample = memory[mi];
    out[i] = sample;
    // Damped feedback: simple onepole lowpass on the feedback signal so
    // high frequencies decay faster — mimics natural air absorption.
    lp = lp * damping + sample * (1 - damping);
    memory[mi] = buf[i] + lp * feedback;
    mi = (mi + 1) % ds;
  }
  return out;
}

function allpassFilter(buf, delaySec, feedback) {
  const ds = Math.floor(delaySec * SAMPLE_RATE);
  const out = new Float32Array(N);
  const memory = new Float32Array(ds);
  let mi = 0;
  for (let i = 0; i < N; i++) {
    const sample = memory[mi];
    const inSample = buf[i] + sample * feedback;
    out[i] = sample - inSample * feedback;
    memory[mi] = inSample;
    mi = (mi + 1) % ds;
  }
  return out;
}

function buildReverb(buf, comb1, comb2, comb3, comb4) {
  // 4 parallel combs at primes — sums to a dense early reflection field
  const c1 = combFilter(buf, comb1, 0.84, 0.18);
  const c2 = combFilter(buf, comb2, 0.83, 0.20);
  const c3 = combFilter(buf, comb3, 0.82, 0.22);
  const c4 = combFilter(buf, comb4, 0.81, 0.24);
  const sum = new Float32Array(N);
  for (let i = 0; i < N; i++) sum[i] = (c1[i] + c2[i] + c3[i] + c4[i]) * 0.25;
  // 2 series allpass for diffusion — smooths the comb sound out
  const a1 = allpassFilter(sum, 0.005, 0.7);
  const a2 = allpassFilter(a1, 0.0017, 0.7);
  return a2;
}

const wetL = buildReverb(left,  0.0297, 0.0371, 0.0411, 0.0437);
const wetR = buildReverb(right, 0.0319, 0.0353, 0.0419, 0.0449);
const wetMix = 0.45;
for (let i = 0; i < N; i++) {
  left[i]  = left[i]  * (1 - wetMix * 0.5) + wetL[i] * wetMix;
  right[i] = right[i] * (1 - wetMix * 0.5) + wetR[i] * wetMix;
}

/* ─── Master soft saturation ────────────────────────────────────────── */
function softSat(buf) {
  for (let i = 0; i < N; i++) {
    const v = buf[i];
    buf[i] = v / (1 + Math.abs(v) * 0.35);
  }
}
softSat(left); softSat(right);

/* ─── 16-bit stereo PCM WAV ─────────────────────────────────────────── */
const HEADER_LEN = 44;
const buf = Buffer.alloc(HEADER_LEN + N * 4);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write("WAVE", 8);
buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SAMPLE_RATE, 24);
buf.writeUInt32LE(SAMPLE_RATE * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(N * 4, 40);

for (let i = 0; i < N; i++) {
  const l = Math.max(-1, Math.min(1, left[i]));
  const r = Math.max(-1, Math.min(1, right[i]));
  buf.writeInt16LE(Math.round(l * 32767), HEADER_LEN + i * 4);
  buf.writeInt16LE(Math.round(r * 32767), HEADER_LEN + i * 4 + 2);
}

const out = path.resolve(__dirname, "..", "public", "sounds", "shardtown-launch.wav");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buf);
console.log(`wrote ${out} (${(buf.length / 1024).toFixed(1)} KB, ${DURATION}s @ ${SAMPLE_RATE}Hz, stereo)`);
