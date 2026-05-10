#!/usr/bin/env node
/**
 * Shardtown launch sound — v3: cinematic with pre-impact rise + reverb.
 *
 * Three layers:
 * 1. PRE-RISE (0.0–0.6s) — filtered white noise sweeping up + an
 *    ascending pitched element. Builds anticipation. Fades to silence
 *    just before the hit.
 * 2. HIT + BLOOM (0.6s) — sub-bass impact at 55Hz with pitch envelope,
 *    Cmaj9 chord struck like a bell with inharmonic partials, staggered
 *    note entries so the chord opens up.
 * 3. REVERB TAIL (0.6–4s) — fake convolution via 4 stacked feedback
 *    delays at prime intervals, mixed under the dry signal. Gives the
 *    sound space and a long natural decay.
 *
 * Stereo. Slight per-voice panning so the chord feels wide.
 *
 * Run: node scripts/gen-launch-sound.cjs
 * Output: public/sounds/shardtown-launch.wav
 */

const fs = require("fs");
const path = require("path");

const SAMPLE_RATE = 44100;
const DURATION = 4.0;
const N = Math.floor(SAMPLE_RATE * DURATION);
const HIT_AT = 0.6; // when the chord lands

const left = new Float32Array(N);
const right = new Float32Array(N);

function pan(p, s, leftBuf, rightBuf, i) {
  // Equal-power panning. p in [-1, 1].
  const l = Math.cos((p + 1) * Math.PI / 4);
  const r = Math.sin((p + 1) * Math.PI / 4);
  leftBuf[i] += s * l;
  rightBuf[i] += s * r;
}

/* ─── 1. Pre-rise: filtered noise + ascending sine ─────────────────── */
let lpfPrev = 0;
for (let i = 0; i < N; i++) {
  const t = i / SAMPLE_RATE;
  if (t > HIT_AT) break;
  const k = t / HIT_AT; // 0 → 1
  // White noise → simple lowpass that opens up over time
  const cutoff = 0.02 + 0.4 * k; // 0..1 normalized
  const noise = Math.random() * 2 - 1;
  lpfPrev = lpfPrev + cutoff * (noise - lpfPrev);
  const noiseEnv = Math.pow(k, 2) * (1 - Math.pow(k, 8)) * 0.18;
  pan(0, lpfPrev * noiseEnv, left, right, i);

  // Ascending sine glide — F2 (87Hz) up to C3 (130.8Hz) over 600ms
  const f = 87 + (130.8 - 87) * Math.pow(k, 1.5);
  const riseEnv = Math.pow(k, 1.8) * (1 - Math.pow(k, 12)) * 0.08;
  const rise = Math.sin(2 * Math.PI * f * t);
  pan(0, rise * riseEnv, left, right, i);
}

/* ─── 2. Hit: sub-bass impact ──────────────────────────────────────── */
function addImpact() {
  const f = 55;
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE - HIT_AT;
    if (t < 0 || t > 0.4) continue;
    const env = t < 0.003 ? t / 0.003 : Math.exp(-t / 0.08);
    const pitched = f * (1 + 0.5 * Math.exp(-t / 0.05));
    const s = 0.55 * env * Math.sin(2 * Math.PI * pitched * t);
    pan(0, s, left, right, i);
  }
}
addImpact();

/* ─── 2. Hit: Cmaj9 bell chord, staggered + panned ─────────────────── */
function addBellVoice(start, f, amp, panning) {
  const partials = [
    { ratio: 1.00, amp: 1.00, decay: 2.4 },
    { ratio: 2.00, amp: 0.42, decay: 1.7 },
    { ratio: 3.01, amp: 0.28, decay: 1.1 },
    { ratio: 4.07, amp: 0.18, decay: 0.7 },
    { ratio: 5.10, amp: 0.10, decay: 0.4 },
  ];
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE - (HIT_AT + start);
    if (t < 0) continue;
    const attack = t < 0.003 ? t / 0.003 : 1;
    let s = 0;
    for (const p of partials) {
      s += p.amp * Math.exp(-t / p.decay) * Math.sin(2 * Math.PI * f * p.ratio * t);
    }
    pan(panning, s * amp * attack, left, right, i);
  }
}

const chord = [
  { f:  65.41, start: 0.00, amp: 0.18, pan:  0.00 }, // C2  centered bass
  { f: 130.81, start: 0.00, amp: 0.20, pan:  0.00 }, // C3  centered
  { f: 164.81, start: 0.04, amp: 0.18, pan: -0.35 }, // E3  left
  { f: 196.00, start: 0.08, amp: 0.18, pan:  0.35 }, // G3  right
  { f: 246.94, start: 0.13, amp: 0.16, pan: -0.55 }, // B3  more left
  { f: 293.66, start: 0.20, amp: 0.14, pan:  0.55 }, // D4  more right
];
for (const n of chord) addBellVoice(n.start, n.f, n.amp, n.pan);

/* ─── 3. Reverb tail: 4 stacked feedback delays at prime intervals ── */
function addReverb(buf, otherBuf) {
  // Different delay times per channel for natural width.
  const delays = buf === left
    ? [0.0379, 0.0631, 0.0911, 0.1283]
    : [0.0413, 0.0587, 0.0941, 0.1217];
  const feedback = 0.62;
  const mix = 0.32;
  const wet = new Float32Array(N);
  for (const d of delays) {
    const ds = Math.floor(d * SAMPLE_RATE);
    for (let i = ds; i < N; i++) {
      // Inject the dry signal + the prior wet content (cross-channel for stereo spread)
      wet[i] += feedback * 0.25 * (buf[i - ds] + 0.4 * otherBuf[i - ds] + wet[i - ds]);
    }
  }
  for (let i = 0; i < N; i++) buf[i] += wet[i] * mix;
}
addReverb(left, right);
addReverb(right, left);

/* ─── Master tail fade + soft limiter ─────────────────────────────── */
const fadeStart = Math.floor((DURATION - 0.6) * SAMPLE_RATE);
for (let i = fadeStart; i < N; i++) {
  const k = (N - i) / (N - fadeStart);
  left[i]  *= k;
  right[i] *= k;
}
function limit(buf) {
  for (let i = 0; i < N; i++) {
    const v = buf[i];
    if (v > 0.95) buf[i] = 0.95 + (v - 0.95) * 0.1;
    else if (v < -0.95) buf[i] = -0.95 + (v + 0.95) * 0.1;
  }
}
limit(left); limit(right);

/* ─── Write 16-bit stereo PCM WAV ─────────────────────────────────── */
const HEADER_LEN = 44;
const buf = Buffer.alloc(HEADER_LEN + N * 4); // 2 channels × 2 bytes
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write("WAVE", 8);
buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);                   // PCM
buf.writeUInt16LE(2, 22);                   // stereo
buf.writeUInt32LE(SAMPLE_RATE, 24);
buf.writeUInt32LE(SAMPLE_RATE * 4, 28);     // byte rate (sr * 4)
buf.writeUInt16LE(4, 32);                   // block align
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
