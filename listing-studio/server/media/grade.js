// Automatic colour correction from measured clip statistics.
//
// 1. White balance — grey-world over neutral mid-tones, applied as R/B channel gains.
// 2. Levels — black/white points from the luma histogram, with a soft highlight
//    shoulder so window views roll off instead of clipping hard.
// 3. Mid-tone placement — moves median luma to the look's target (interiors read
//    "bright and airy" around 0.52–0.56 on the median).
// 4. Vibrance + a light unsharp after scaling.
//
// Every correction is clamped, and scaled by `strength` (0..1), so a bad
// measurement can never produce an extreme grade.

export const LOOKS = {
  natural: { label: 'Natural', mid: 0.5, black: 0.02, white: 0.975, vibrance: 0.08, warmth: 0, contrast: 0 },
  bright: { label: 'Bright & airy', mid: 0.55, black: 0.03, white: 0.985, vibrance: 0.12, warmth: 0.01, contrast: 0 },
  warm: { label: 'Warm editorial', mid: 0.52, black: 0.03, white: 0.97, vibrance: 0.1, warmth: 0.035, contrast: 0.04 },
  crisp: { label: 'Crisp modern', mid: 0.5, black: 0.012, white: 0.985, vibrance: 0.14, warmth: -0.01, contrast: 0.07 },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Monotone (PCHIP) curve interpolation needs FFmpeg 5.1+; older builds fall back to splines.
let curveInterp = 'pchip';
export function setCurveInterp(v) {
  curveInterp = v;
}
const lerp = (a, b, t) => a + (b - a) * t;
const f = (v) => Number(v.toFixed(4)).toString();

export function computeGrade(color, { look = 'bright', strength = 0.8, wbAmount = 0.85 } = {}) {
  const L = LOOKS[look] || LOOKS.bright;
  const s = clamp(strength, 0, 1);

  // --- White balance gains (relative to green) ---
  let gainR = 1;
  let gainB = 1;
  if (color && color.neutralCoverage > 0.004 && color.gMid > 0.05) {
    gainR = clamp(color.gMid / Math.max(0.01, color.rMid), 0.82, 1.22);
    gainB = clamp(color.gMid / Math.max(0.01, color.bMid), 0.82, 1.22);
  }
  gainR = Math.pow(gainR, wbAmount * s) * (1 + L.warmth);
  gainB = Math.pow(gainB, wbAmount * s) * (1 - L.warmth);

  // --- Levels ---
  const p005 = color?.p005 ?? 0;
  const p50 = color?.p50 ?? 0.5;
  const p995 = color?.p995 ?? 1;
  const bpIn = lerp(0, clamp(p005, 0, 0.12), s);
  const wpIn = lerp(1, clamp(p995, 0.72, 1), s);
  const bpOut = lerp(0, L.black, s);
  const wpOut = lerp(1, L.white, s);

  // Where the median lands after levels, then where we want it.
  const midIn = clamp(p50, bpIn + 0.05, wpIn - 0.05);
  const linear = bpOut + ((midIn - bpIn) / Math.max(0.05, wpIn - bpIn)) * (wpOut - bpOut);
  // Lift dark footage freely (up to +0.16) but never pull a bright, high-key room down
  // by more than a touch — listing video should not get darker.
  const midOut = clamp(lerp(linear, L.mid, s), Math.max(linear - 0.03, midIn - 0.02), linear + 0.16);

  const points = [[0, 0]];
  if (bpIn > 0.001) points.push([bpIn, bpOut]);
  // Gentle S-curve for contrast-forward looks.
  if (L.contrast > 0) {
    const q1 = bpIn + (midIn - bpIn) * 0.5;
    const q1o = bpOut + (midOut - bpOut) * (0.5 - L.contrast * s);
    points.push([q1, q1o]);
  }
  points.push([midIn, midOut]);
  if (L.contrast > 0) {
    const q3 = midIn + (wpIn - midIn) * 0.5;
    const q3o = midOut + (wpOut - midOut) * (0.5 + L.contrast * s);
    points.push([q3, q3o]);
  }
  if (wpIn < 0.999) points.push([wpIn, wpOut]);
  points.push([1, 1]);
  // Make strictly increasing in x (pchip requires it) and drop near-duplicates.
  const curve = [];
  for (const p of points.sort((a, b) => a[0] - b[0])) {
    const prev = curve[curve.length - 1];
    if (prev && p[0] - prev[0] < 0.01) continue;
    curve.push([clamp(p[0], 0, 1), clamp(p[1], 0, 1)]);
  }
  const curveStr = curve.map(([x, y]) => `${f(x)}/${f(y)}`).join(' ');

  const filters = [];
  if (Math.abs(gainR - 1) > 0.004 || Math.abs(gainB - 1) > 0.004) {
    filters.push(`colorchannelmixer=rr=${f(gainR)}:gg=1:bb=${f(gainB)}`);
  }
  filters.push(`curves=master='${curveStr}'${curveInterp ? `:interp=${curveInterp}` : ''}`);
  const vib = L.vibrance * s;
  if (vib > 0.005) filters.push(`vibrance=intensity=${f(vib)}`);

  return {
    filters,
    params: {
      look,
      strength: s,
      gainR: Number(gainR.toFixed(4)),
      gainB: Number(gainB.toFixed(4)),
      curve,
      vibrance: Number(vib.toFixed(3)),
    },
  };
}
