#!/usr/bin/env node
/**
 * Generates the Shardtown launch chime as a 16-bit mono WAV at 44.1kHz.
 *
 * Sound design intent:
 * - Sustained F3 pad in the background gives the cinematic "open" feel.
 * - F major triad arpeggiated (F4 → A4 → C5) with 250ms staggers, sine
 *   waves with a +2nd harmonic blend for warmth instead of pure sine.
 * - ADSR envelope on every voice (0.15s attack, 0.5s release) so nothing
 *   pops in or cuts out — that's what makes it feel like a brand moment
 *   instead of a Mac sound.
 * - Total ~2s; matches the 2.4s minimum boot intro.
 *
 * Run: node scripts/gen-launch-sound.js
 * Output: public/sounds/shardtown-launch.wav
 */

const fs = require("fs");
const path = require("path");

const SAMPLE_RATE = 44100;
const DURATION = 2.0;
const N = Math.floor(SAMPLE_RATE * DURATION);

function envelope(t, attack, decay, sustain, release, total) {
  if (t < 0) return 0;
  if (t > total) return 0;
  if (t < attack) return t / attack;
  if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / decay);
  if (t < total - release) return sustain;
  return Math.max(0, sustain * (1 - (t - (total - release)) / release));
}

const samples = new Float32Array(N);

// Arpeggiated F major triad
const notes = [
  { freq: 349.23, start: 0.00, len: 1.7 }, // F4
  { freq: 440.00, start: 0.30, len: 1.5 }, // A4
  { freq: 523.25, start: 0.55, len: 1.4 }, // C5
];

for (const note of notes) {
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const localT = t - note.start;
    if (localT < 0 || localT > note.len) continue;
    const env = envelope(localT, 0.15, 0.25, 0.6, 0.6, note.len);
    const fundamental = Math.sin(2 * Math.PI * note.freq * localT);
    const harmonic = 0.28 * Math.sin(2 * Math.PI * note.freq * 2 * localT);
    samples[i] += (fundamental + harmonic) * env * 0.22;
  }
}

// Sustained low pad (F3) underneath for cinematic depth
for (let i = 0; i < N; i++) {
  const t = i / SAMPLE_RATE;
  const env = envelope(t, 0.4, 0.0, 1.0, 0.6, DURATION);
  // Slight detuning between two oscillators for chorus-like warmth
  const pad = 0.5 * Math.sin(2 * Math.PI * 174.61 * t)
            + 0.5 * Math.sin(2 * Math.PI * 174.85 * t);
  samples[i] += pad * env * 0.09;
}

// Write 16-bit PCM mono WAV
const HEADER_LEN = 44;
const buf = Buffer.alloc(HEADER_LEN + N * 2);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + N * 2, 4);
buf.write("WAVE", 8);
buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16);          // fmt chunk size
buf.writeUInt16LE(1, 20);           // PCM
buf.writeUInt16LE(1, 22);           // mono
buf.writeUInt32LE(SAMPLE_RATE, 24);
buf.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate (sr * 2 bytes/sample)
buf.writeUInt16LE(2, 32);           // block align
buf.writeUInt16LE(16, 34);          // bits per sample
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
