#!/usr/bin/env node
/**
 * Shardtown launch sound — v6: Glass-style chime, mid-register, short.
 *
 * The previous pad (v5) was too high — bright sparkle, long swell, way
 * more elaborate than what's needed. Glass is short (~600ms), two soft
 * tones in the middle register, gentle decay, that's it. We adopt the
 * same restraint with our own voicing:
 *
 * - F major triad in the middle register (F3 / A3 / C4) — warm but not
 *   muddy, no top end above C4 so nothing reads as "aigu".
 * - Bell-like additive synthesis with INTEGER harmonics (1x, 2x, 3x).
 *   No inharmonic ratios → no metallic glass-tinkle, just a warm chime.
 * - Notes hit with 30/60ms staggers so the chord blooms without a hard
 *   block hit.
 * - Bell envelope: 5ms attack ramp (no click), exponential 800ms decay.
 * - Light Schroeder reverb, much drier than v5 (25% wet vs 45%).
 * - Total 1.5s with 400ms tail fade.
 *
 * Run: node scripts/gen-launch-sound.cjs
 * Output: public/sounds/shardtown-launch.wav
 */

const fs = require("fs");
const path = require("path");

const SAMPLE_RATE = 44100;
const DURATION = 1.5;
const N = Math.floor(SAMPLE_RATE * DURATION);

const left = new Float32Array(N);
const right = new Float32Array(N);

function pan(p, s, leftBuf, rightBuf, i) {
  const l = Math.cos((p + 1) * Math.PI / 4);
  const r = Math.sin((p + 1) * Math.PI / 4);
  leftBuf[i] += s * l;
  rightBuf[i] += s * r;
}

/**
 * Single chime voice, integer harmonics only. The 2nd partial decays
 * faster than the fundamental so the high content fades first — same
 * trick a real bell uses to sound "settled" after the initial strike.
 */
function addChimeVoice(start, f, amp, panning) {
  const partials = [
    { ratio: 1, amp: 1.00, decay: 0.9 },
    { ratio: 2, amp: 0.35, decay: 0.5 },
    { ratio: 3, amp: 0.12, decay: 0.3 },
  ];
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    const attack = t < 0.005 ? t / 0.005 : 1;
    let s = 0;
    for (const p of partials) {
      s += p.amp * Math.exp(-t / p.decay) * Math.sin(2 * Math.PI * f * p.ratio * t);
    }
    pan(panning, s * amp * attack, left, right, i);
  }
}

// F major triad, middle register. Light staggers (30ms / 60ms) so the
// triad blooms instead of stacking instantly.
const chord = [
  { f: 174.61, start: 0.000, amp: 0.32, pan:  0.00 }, // F3
  { f: 220.00, start: 0.030, amp: 0.30, pan: -0.25 }, // A3
  { f: 261.63, start: 0.060, amp: 0.28, pan:  0.25 }, // C4
];
for (const n of chord) addChimeVoice(n.start, n.f, n.amp, n.pan);

/* ─── Light Schroeder reverb ─────────────────────────────────────────── */
function combFilter(buf, delaySec, feedback, damping) {
  const ds = Math.floor(delaySec * SAMPLE_RATE);
  const out = new Float32Array(N);
  const memory = new Float32Array(ds);
  let mi = 0, lp = 0;
  for (let i = 0; i < N; i++) {
    const sample = memory[mi];
    out[i] = sample;
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

function buildReverb(buf, c1, c2, c3, c4) {
  // Smaller room than v5 — short delays, less feedback, drier mix.
  const r1 = combFilter(buf, c1, 0.74, 0.30);
  const r2 = combFilter(buf, c2, 0.73, 0.32);
  const r3 = combFilter(buf, c3, 0.72, 0.34);
  const r4 = combFilter(buf, c4, 0.71, 0.36);
  const sum = new Float32Array(N);
  for (let i = 0; i < N; i++) sum[i] = (r1[i] + r2[i] + r3[i] + r4[i]) * 0.25;
  const a1 = allpassFilter(sum, 0.005, 0.7);
  return allpassFilter(a1, 0.0017, 0.7);
}

const wetL = buildReverb(left,  0.0211, 0.0273, 0.0317, 0.0349);
const wetR = buildReverb(right, 0.0227, 0.0263, 0.0331, 0.0367);
const wetMix = 0.25;
for (let i = 0; i < N; i++) {
  left[i]  = left[i]  * (1 - wetMix * 0.4) + wetL[i] * wetMix;
  right[i] = right[i] * (1 - wetMix * 0.4) + wetR[i] * wetMix;
}

/* ─── Tail fade-out + soft saturation ───────────────────────────────── */
const fadeStart = Math.floor((DURATION - 0.4) * SAMPLE_RATE);
for (let i = fadeStart; i < N; i++) {
  const k = (N - i) / (N - fadeStart);
  const env = k * k;
  left[i]  *= env;
  right[i] *= env;
}

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
