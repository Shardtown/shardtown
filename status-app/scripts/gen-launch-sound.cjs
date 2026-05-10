#!/usr/bin/env node
/**
 * Shardtown launch sound — v4: continuous swell, harmonic coherence, soft tail.
 *
 * Fixes from v3:
 * - The pre-rise was noise + a glide F2→C3 unrelated to the chord, which
 *   felt disconnected. Now the rise IS the chord — sub C2/C3 fundamentals
 *   plus a higher C5 sparkle swelling in. Same harmonic family throughout,
 *   so the impact feels like the chord finally "anchoring" instead of
 *   appearing out of nowhere.
 * - No more discrete pre-rise → impact → tail layers. The bell partials
 *   start their attack during the rise, just at very low amplitude, so
 *   there's no perceptible "switch" between sections.
 * - Long exponential fade over 1.2s at the end — the linear fade in v3
 *   was making the tail die abruptly.
 *
 * Run: node scripts/gen-launch-sound.cjs
 * Output: public/sounds/shardtown-launch.wav
 */

const fs = require("fs");
const path = require("path");

const SAMPLE_RATE = 44100;
const DURATION = 4.5;
const N = Math.floor(SAMPLE_RATE * DURATION);
const HIT_AT = 0.7; // peak intensity moment

const left = new Float32Array(N);
const right = new Float32Array(N);

function pan(p, s, leftBuf, rightBuf, i) {
  const l = Math.cos((p + 1) * Math.PI / 4);
  const r = Math.sin((p + 1) * Math.PI / 4);
  leftBuf[i] += s * l;
  rightBuf[i] += s * r;
}

/** Smooth swell envelope: ease-in to peak at HIT_AT, then bell-like decay. */
function bellEnv(t, swellSec, decaySec) {
  if (t < 0) return 0;
  if (t < swellSec) {
    // ease-in cubic — smoother than linear
    const k = t / swellSec;
    return k * k * (3 - 2 * k);
  }
  return Math.exp(-(t - swellSec) / decaySec);
}

/* ─── Bell voice with continuous swell + decay (no segmentation) ────── */
function addBellVoice(start, swell, f, amp, panning) {
  const partials = [
    { ratio: 1.00, amp: 1.00, decay: 2.6 },
    { ratio: 2.00, amp: 0.42, decay: 1.8 },
    { ratio: 3.01, amp: 0.28, decay: 1.2 },
    { ratio: 4.07, amp: 0.18, decay: 0.7 },
    { ratio: 5.10, amp: 0.10, decay: 0.4 },
  ];
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    let s = 0;
    for (const p of partials) {
      const env = bellEnv(t, swell, p.decay);
      s += p.amp * env * Math.sin(2 * Math.PI * f * p.ratio * t);
    }
    pan(panning, s * amp, left, right, i);
  }
}

/**
 * The chord builds in over the swell time — every voice starts at t=0 but
 * with its own swell duration so they fade in staggered yet smoothly. The
 * voices that "hit later" actually have shorter swells, so the perceived
 * "blooming" comes from the swell durations, not from gaps in time.
 */
const chord = [
  // Sub-bass + bass: long swell so they're present from the start
  { f:  65.41, swell: 0.65, amp: 0.20, pan:  0.00 }, // C2  bass
  { f: 130.81, swell: 0.65, amp: 0.22, pan:  0.00 }, // C3
  // Mid voices: medium swell, panned for width
  { f: 164.81, swell: 0.55, amp: 0.20, pan: -0.30 }, // E3  left
  { f: 196.00, swell: 0.50, amp: 0.20, pan:  0.30 }, // G3  right
  // High voices: shorter swell, more outboard pan, "sparkle" coming in last
  { f: 246.94, swell: 0.42, amp: 0.18, pan: -0.55 }, // B3
  { f: 293.66, swell: 0.35, amp: 0.16, pan:  0.55 }, // D4
  // Top harmonic — high C5 as the cinematic "sparkle"
  { f: 523.25, swell: 0.55, amp: 0.10, pan:  0.00 }, // C5
];
for (const n of chord) addBellVoice(0, n.swell, n.f, n.amp, n.pan);

/* ─── Soft sub-bass "weight" that swells in and lingers ─────────────── */
// Not a discrete impact — a continuous low rumble that anchors the chord.
for (let i = 0; i < N; i++) {
  const t = i / SAMPLE_RATE;
  // Swell in over 500ms, peak around HIT_AT, then very slow decay
  const swellEnv = t < 0.5 ? Math.pow(t / 0.5, 2) : Math.exp(-(t - 0.5) / 2.2);
  // Two slightly detuned subs (32.7 and 32.85 Hz, C1) for warmth without clash
  const sub = 0.5 * Math.sin(2 * Math.PI * 32.70 * t)
            + 0.5 * Math.sin(2 * Math.PI * 32.85 * t);
  const s = sub * swellEnv * 0.18;
  left[i]  += s;
  right[i] += s;
}

/* ─── Air shimmer — very subtle filtered noise that adds "space" ─────── */
let lpfL = 0, lpfR = 0;
for (let i = 0; i < N; i++) {
  const t = i / SAMPLE_RATE;
  // Swell in slowly, fade out by 3s
  const env = t < HIT_AT
    ? Math.pow(t / HIT_AT, 2.5) * 0.5
    : Math.exp(-(t - HIT_AT) / 1.8) * 0.5;
  if (env < 0.001) continue;
  // Stereo decorrelated noise, lowpass for "air" not "hiss"
  const cutoff = 0.06;
  const nL = Math.random() * 2 - 1;
  const nR = Math.random() * 2 - 1;
  lpfL = lpfL + cutoff * (nL - lpfL);
  lpfR = lpfR + cutoff * (nR - lpfR);
  left[i]  += lpfL * env * 0.05;
  right[i] += lpfR * env * 0.05;
}

/* ─── Reverb: stacked feedback delays, longer + smoother ────────────── */
function addReverb(buf, otherBuf) {
  const delays = buf === left
    ? [0.0379, 0.0631, 0.0911, 0.1283, 0.1721]
    : [0.0413, 0.0587, 0.0941, 0.1217, 0.1759];
  const feedback = 0.68;
  const mix = 0.36;
  const wet = new Float32Array(N);
  for (const d of delays) {
    const ds = Math.floor(d * SAMPLE_RATE);
    for (let i = ds; i < N; i++) {
      wet[i] += feedback * 0.20 * (buf[i - ds] + 0.45 * otherBuf[i - ds] + wet[i - ds]);
    }
  }
  for (let i = 0; i < N; i++) buf[i] += wet[i] * mix;
}
addReverb(left, right);
addReverb(right, left);

/* ─── Master: long exponential fade-out so the tail dies smoothly ───── */
const fadeStart = Math.floor((DURATION - 1.2) * SAMPLE_RATE);
for (let i = fadeStart; i < N; i++) {
  // Exponential rather than linear — perceptually smoother for decays.
  const k = (N - i) / (N - fadeStart);
  const env = k * k; // ease-out
  left[i]  *= env;
  right[i] *= env;
}

/* ─── Soft saturation instead of hard limiter — warmer than clipping ── */
function softSat(buf) {
  for (let i = 0; i < N; i++) {
    const v = buf[i];
    // tanh-like soft clip via algebraic approximation
    buf[i] = v / (1 + Math.abs(v) * 0.4);
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

void HIT_AT; // referenced only in comments now
