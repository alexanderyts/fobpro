import fs from 'node:fs/promises';
import path from 'node:path';
import { runFFmpeg, escapeFilterValue } from './ffmpeg.js';
import { toSdr, toRgb, chain } from './filters.js';

const MOTION_W = 640;
const STAT_W = 96;
const STAT_H = 54;
const STATIC_SPEED = 0.01; // below 1% of frame width per second the shot reads as locked-off

/**
 * One decode pass per clip produces:
 *  - a 540p H.264 proxy for in-browser review (camera HEVC/ProRes often won't play in browsers),
 *  - camera-motion transforms (libvidstab) used to find the steady part of the shot,
 *  - 1 fps low-res RGB samples used for exposure / white-balance analysis.
 * Thumbnails and a filmstrip are pulled afterwards with fast seeks.
 */
export async function analyzeClip({ file, meta, workDir, onProgress, signal }) {
  await fs.mkdir(workDir, { recursive: true });
  const proxy = path.join(workDir, 'proxy.mp4');
  const trf = path.join(workDir, 'motion.trf');
  const stats = path.join(workDir, 'stats.rgb');

  const sdr = toSdr(meta);
  const graph = [
    `[0:v]${chain(sdr, 'split=3')}[p][m][s]`,
    `[p]scale=-2:540:flags=bicubic,format=yuv420p[pout]`,
    `[m]scale=${MOTION_W}:-2,vidstabdetect=shakiness=6:accuracy=9:stepsize=6:result='${escapeFilterValue(trf)}'[mout]`,
    `[s]fps=2,${toRgb(sdr ? { ...meta, hdr: 'tm' } : meta, { w: STAT_W, h: STAT_H, pixFmt: 'rgb24' })}[sout]`,
  ].join(';');

  await runFFmpeg(
    [
      '-i', file,
      '-filter_complex', graph,
      '-map', '[pout]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27',
      '-movflags', '+faststart', proxy,
      '-map', '[mout]', '-f', 'null', '-',
      '-map', '[sout]', '-f', 'rawvideo', stats,
    ],
    { expectedDuration: meta.duration, onProgress: (p) => onProgress?.(p * 0.85), signal },
  );

  const motion = parseMotion(await fs.readFile(trf, 'utf8'), meta.fps || 30, MOTION_W);
  const color = colorStats(await fs.readFile(stats), STAT_W, STAT_H, 2);
  const trim = findSteadyRange(motion, meta);

  const mid = (trim.in + trim.out) / 2;
  const poster = path.join(workDir, 'poster.jpg');
  const strip = path.join(workDir, 'strip.jpg');
  await runFFmpeg(['-ss', String(mid), '-i', proxy, '-frames:v', '1', '-q:v', '3', '-vf', 'scale=640:-2', poster], { signal });
  const span = Math.max(0.1, meta.duration);
  await runFFmpeg(
    ['-i', proxy, '-vf', `fps=10/${span.toFixed(3)},scale=192:-2,tile=10x1`, '-frames:v', '1', '-q:v', '4', strip],
    { signal },
  );
  onProgress?.(1);

  const flags = [];
  if (trim.shake > 0.0045) flags.push('handheld');
  if (motion.speed < STATIC_SPEED) flags.push('static');
  if (color.p50 < 0.28) flags.push('underexposed');
  if (color.clipHigh > 0.06) flags.push('blown-highlights');
  if (color.neutralCoverage > 0 && Math.abs(color.castRB) > 0.05) flags.push(color.castRB > 0 ? 'warm-cast' : 'cool-cast');

  return {
    trimIn: trim.in,
    trimOut: trim.out,
    shake: trim.shake,
    motion: { speed: motion.speed, direction: motion.direction, envelope: motion.envelope, envelopeRate: motion.envelopeRate },
    color,
    flags,
    files: { proxy: 'proxy.mp4', poster: 'poster.jpg', strip: 'strip.jpg' },
  };
}

/** Parse a libvidstab ASCII transforms file into per-frame global translation. */
export function parseMotion(text, fps, width) {
  const frames = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('Frame ')) continue;
    const vecs = [...line.matchAll(/\(LM (-?\d+) (-?\d+) /g)].map((m) => [Number(m[1]), Number(m[2])]);
    if (!vecs.length) {
      frames.push(null);
      continue;
    }
    const mx = median(vecs.map((v) => v[0]));
    const my = median(vecs.map((v) => v[1]));
    // Trimmed mean around the median for sub-pixel precision without outliers.
    const near = vecs.filter((v) => Math.abs(v[0] - mx) <= 2 && Math.abs(v[1] - my) <= 2);
    const dx = near.length ? near.reduce((a, v) => a + v[0], 0) / near.length : mx;
    const dy = near.length ? near.reduce((a, v) => a + v[1], 0) / near.length : my;
    frames.push([dx / width, dy / width]);
  }
  // Fill gaps (featureless frames) with neighbours.
  let last = [0, 0];
  const filled = frames.map((f) => (f ? (last = f) : last));

  const w = Math.max(3, Math.round(fps * 0.5)) | 1;
  const smooth = movingAverage(filled, w);
  const residual = filled.map((f, i) => Math.hypot(f[0] - smooth[i][0], f[1] - smooth[i][1]));
  const energy = rollingRms(residual, Math.max(2, Math.round(fps * 0.25)));
  // Camera speed in frame-widths per second (fps-independent).
  const speeds = smooth.map((s) => Math.hypot(s[0], s[1]) * fps);
  const speed = median(speeds.slice(Math.floor(speeds.length * 0.2), Math.ceil(speeds.length * 0.8)));
  const sx = median(smooth.map((s) => s[0]));
  const sy = median(smooth.map((s) => s[1]));
  let direction = 'static';
  if (speed >= STATIC_SPEED) {
    // libvidstab reports the camera's own translation: +x = camera moving right.
    if (Math.abs(sx) >= Math.abs(sy)) direction = sx > 0 ? 'right' : 'left';
    else direction = sy > 0 ? 'down' : 'up';
  }

  // Downsample the energy envelope to ~10 points/sec for the UI.
  const step = Math.max(1, Math.round(fps / 10));
  const envelope = [];
  for (let i = 0; i < energy.length; i += step) envelope.push(Number(energy[i].toFixed(5)));

  return { fps, energy, speed: Number(speed.toFixed(4)), direction, envelope, envelopeRate: fps / step };
}

/**
 * Find where the operator has settled into the move. Gimbal shots usually start
 * with a jolt (record press, first step) and end with a stop; trim those.
 */
export function findSteadyRange(motion, meta) {
  const { energy, fps } = motion;
  const dur = meta.duration;
  const minHandle = Math.min(0.25, dur * 0.1);
  const maxTrim = dur * 0.35;
  if (!energy.length) return { in: minHandle, out: Math.max(minHandle + 0.1, dur - minHandle), shake: 0 };

  const med = median(energy);
  const th = Math.max(0.0035, med * 2.5);
  const hold = Math.max(2, Math.round(fps * 0.5));

  const steadyFrom = (i) => {
    for (let k = i; k < Math.min(energy.length, i + hold); k++) if (energy[k] > th) return false;
    return true;
  };

  let a = 0;
  while (a < energy.length && !steadyFrom(a)) a++;
  let b = energy.length - 1;
  while (b > a) {
    let ok = true;
    for (let k = b; k > Math.max(-1, b - hold); k--) if (energy[k] > th) ok = false;
    if (ok) break;
    b--;
  }
  let tin = a / fps;
  let tout = (b + 1) / fps;
  if (a >= energy.length || tout - tin < 1) {
    tin = Math.min(0.5, dur * 0.1);
    tout = dur - Math.min(0.5, dur * 0.1);
  }
  tin = clamp(tin, minHandle, maxTrim);
  tout = clamp(tout, dur - maxTrim, dur - minHandle);
  if (tout - tin < 0.5) {
    tin = minHandle;
    tout = dur - minHandle;
  }

  const fa = Math.floor(tin * fps);
  const fb = Math.min(energy.length, Math.ceil(tout * fps));
  const shake = median(energy.slice(fa, fb)) || 0;
  return { in: round3(tin), out: round3(tout), shake: Number(shake.toFixed(5)) };
}

/** Exposure and colour-balance statistics from raw RGB24 samples. */
export function colorStats(buf, w, h, rate) {
  const px = w * h;
  const frameBytes = px * 3;
  const frames = Math.floor(buf.length / frameBytes);
  const hist = new Uint32Array(256);
  let rB = 0, gB = 0, bB = 0, nB = 0;
  let rM = 0, gM = 0, bM = 0, nM = 0;
  let clip = 0, total = 0;
  const perFrame = [];
  for (let f = 0; f < frames; f++) {
    let fl = 0;
    const o = f * frameBytes;
    for (let i = 0; i < px; i++) {
      const r = buf[o + i * 3], g = buf[o + i * 3 + 1], b = buf[o + i * 3 + 2];
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      hist[Math.min(255, Math.round(y))]++;
      fl += y;
      total++;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx > 250) {
        clip++;
        continue;
      }
      // White-balance reference: interiors are dominated by white ceilings, trim and
      // walls. Bright, low-saturation pixels are the most reliable neutral; a cast of
      // up to ~25% saturation still qualifies, while wood floors and fabrics don't.
      const sat = mx > 0 ? (mx - mn) / mx : 0;
      if (y >= 150 && sat < 0.25) {
        rB += r; gB += g; bB += b; nB++;
      } else if (y >= 60 && y < 150 && sat < 0.2) {
        rM += r; gM += g; bM += b; nM++;
      }
    }
    perFrame.push(Number((fl / px / 255).toFixed(4)));
  }
  const pct = (p) => {
    const target = total * p;
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= target) return i / 255;
    }
    return 1;
  };
  // Prefer the bright-neutral estimate; fall back to low-saturation mid-tones.
  const useBright = nB >= total * 0.005;
  const n = useBright ? nB : nM >= total * 0.01 ? nM : 0;
  const [rS, gS, bS] = useBright ? [rB, gB, bB] : [rM, gM, bM];
  const rMid = n ? rS / n / 255 : 0.5;
  const gMid = n ? gS / n / 255 : 0.5;
  const bMid = n ? bS / n / 255 : 0.5;
  return {
    p005: round3(pct(0.005)),
    p05: round3(pct(0.05)),
    p50: round3(pct(0.5)),
    p95: round3(pct(0.95)),
    p995: round3(pct(0.995)),
    mean: round3(perFrame.reduce((a, v) => a + v, 0) / Math.max(1, perFrame.length)),
    rMid: round3(rMid),
    gMid: round3(gMid),
    bMid: round3(bMid),
    neutralCoverage: round3(n / Math.max(1, total)),
    neutralSource: useBright ? 'highlights' : n ? 'midtones' : 'none',
    castRB: round3(rMid - bMid),
    clipHigh: round3(clip / Math.max(1, total)),
    exposureCurve: perFrame,
    sampleRate: rate,
  };
}

function movingAverage(arr, w) {
  const half = Math.floor(w / 2);
  return arr.map((_, i) => {
    let sx = 0, sy = 0, c = 0;
    for (let k = Math.max(0, i - half); k <= Math.min(arr.length - 1, i + half); k++) {
      sx += arr[k][0]; sy += arr[k][1]; c++;
    }
    return [sx / c, sy / c];
  });
}

function rollingRms(arr, w) {
  const half = Math.floor(w / 2);
  return arr.map((_, i) => {
    let s = 0, c = 0;
    for (let k = Math.max(0, i - half); k <= Math.min(arr.length - 1, i + half); k++) {
      s += arr[k] * arr[k]; c++;
    }
    return Math.sqrt(s / c);
  });
}

export function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round3 = (v) => Math.round(v * 1000) / 1000;
