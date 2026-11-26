// Tempo and beat-grid estimation for the music bed, so cuts can land on the beat.
//
// Onset strength = half-wave-rectified spectral flux on a log-magnitude spectrum.
// Tempo = autocorrelation of the onset envelope, weighted toward 70–150 BPM.
// Phase = the grid offset whose beats collect the most onset energy, then each
// beat is nudged to the strongest onset within ±7% of a beat period.

import { runFFmpeg } from './ffmpeg.js';

const SR = 22050;
const N = 1024;
const HOP = 256;

export async function analyzeMusic(file, { signal } = {}) {
  const buf = await runFFmpeg(
    ['-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', 'pipe:1'],
    { stdout: true, signal },
  );
  const samples = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  return detectBeats(samples, SR);
}

export function detectBeats(samples, sr = SR) {
  const duration = samples.length / sr;
  const { env, low } = onsetEnvelope(samples, sr);
  const fr = sr / HOP; // envelope frames per second
  if (env.length < fr * 4) return { bpm: null, beats: [], downbeats: [], duration, confidence: 0 };

  // --- Tempo via autocorrelation ---
  const minLag = Math.floor((60 / 190) * fr);
  const maxLag = Math.ceil((60 / 55) * fr);
  const ac = new Float64Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = lag; i < env.length; i++) s += env[i] * env[i - lag];
    ac[lag] = s / (env.length - lag);
  }
  let best = minLag, bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * fr) / lag;
    // Log-Gaussian prior centred at 110 BPM: typical for listing-video music beds.
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 110) / 0.9, 2));
    const score = ac[lag] * prior;
    if (score > bestScore) { bestScore = score; best = lag; }
  }
  // Parabolic interpolation for sub-frame period.
  const y0 = ac[best - 1] || 0, y1 = ac[best], y2 = ac[best + 1] || 0;
  const denom = y0 - 2 * y1 + y2;
  const period = best + (denom ? (0.5 * (y0 - y2)) / denom : 0);
  const bpm = (60 * fr) / period;

  // Confidence: how much the chosen lag stands out from the average autocorrelation.
  let mean = 0, cnt = 0;
  for (let lag = minLag; lag <= maxLag; lag++) { mean += ac[lag]; cnt++; }
  mean /= cnt;
  const confidence = Math.max(0, Math.min(1, (ac[best] - mean) / (ac[best] + 1e-9)));

  // --- Phase ---
  // Kick drums carry the beat; hi-hats often sit on the off-beat. Weight the
  // low-band onsets so the grid locks to the kick rather than the hats.
  const phaseEnv = env.map((v, i) => v + 2 * low[i]);
  let bestPhase = 0, bestPhaseScore = -Infinity;
  const steps = Math.ceil(period);
  for (let ph = 0; ph < steps; ph++) {
    let s = 0;
    for (let t = ph; t < env.length; t += period) s += phaseEnv[Math.round(t)] || 0;
    if (s > bestPhaseScore) { bestPhaseScore = s; bestPhase = ph; }
  }
  // Envelope frame i covers samples [i*HOP, i*HOP+N); report its centre.
  const offset = N / 2 / sr;

  // --- Beat grid with local snapping ---
  const tol = Math.max(1, Math.round(period * 0.07));
  const beats = [];
  for (let t = bestPhase; t < env.length; t += period) {
    const c = Math.round(t);
    let bi = c, bv = -1;
    for (let k = Math.max(0, c - tol); k <= Math.min(env.length - 1, c + tol); k++) {
      if (phaseEnv[k] > bv) { bv = phaseEnv[k]; bi = k; }
    }
    beats.push(Number(((bi * HOP) / sr + offset).toFixed(3)));
  }

  // Downbeats: assume 4/4 and pick the bar phase with the most onset energy.
  let barPhase = 0, barScore = -Infinity;
  for (let p = 0; p < 4; p++) {
    let s = 0;
    for (let i = p; i < beats.length; i += 4) s += phaseEnv[Math.round(((beats[i] - offset) * sr) / HOP)] || 0;
    if (s > barScore) { barScore = s; barPhase = p; }
  }
  const downbeats = beats.filter((_, i) => i % 4 === barPhase);

  return {
    bpm: Number(bpm.toFixed(2)),
    beats,
    downbeats,
    duration: Number(duration.toFixed(3)),
    confidence: Number(confidence.toFixed(3)),
  };
}

function onsetEnvelope(x, sr) {
  const frames = Math.max(0, Math.floor((x.length - N) / HOP) + 1);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const bins = N / 2;
  let prev = new Float64Array(bins);
  const env = new Float64Array(frames);
  const lowEnv = new Float64Array(frames);
  const lowBins = Math.max(2, Math.round((200 * N) / sr));
  for (let f = 0; f < frames; f++) {
    const o = f * HOP;
    for (let i = 0; i < N; i++) { re[i] = x[o + i] * win[i]; im[i] = 0; }
    fft(re, im);
    const cur = new Float64Array(bins);
    let flux = 0, lowFlux = 0;
    for (let k = 1; k < bins; k++) {
      cur[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
      const d = cur[k] - prev[k];
      if (d > 0) {
        flux += d;
        if (k <= lowBins) lowFlux += d;
      }
    }
    env[f] = flux;
    lowEnv[f] = lowFlux;
    prev = cur;
  }
  return { env: detrend(env), low: detrend(lowEnv) };
}

function detrend(env) {
  const frames = env.length;
  // Remove slow trend (adaptive threshold) and normalise.
  const w = 16;
  const out = new Float64Array(frames);
  let max = 1e-9;
  for (let i = 0; i < frames; i++) {
    let s = 0, c = 0;
    for (let k = Math.max(0, i - w); k <= Math.min(frames - 1, i + w); k++) { s += env[k]; c++; }
    out[i] = Math.max(0, env[i] - s / c);
    if (out[i] > max) max = out[i];
  }
  for (let i = 0; i < frames; i++) out[i] /= max;
  return out;
}

/** In-place iterative radix-2 FFT. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}
