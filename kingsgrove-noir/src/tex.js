// Procedural textures, all drawn on canvases so the sequence needs no image assets.
// Everything is seeded, so every render produces identical pixels.
import * as THREE from 'three';

export function makeRand(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function cnv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

const smooth = t => t * t * (3 - 2 * t);

// Tileable value noise, cellsX x cellsY lattice.
function valueNoise(w, h, cx, cy, rand, out, amp) {
  const g = new Float32Array(cx * cy);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  for (let y = 0; y < h; y++) {
    const fy = y / h * cy, y0 = Math.floor(fy), ty = smooth(fy - y0), y1 = (y0 + 1) % cy;
    for (let x = 0; x < w; x++) {
      const fx = x / w * cx, x0 = Math.floor(fx), tx = smooth(fx - x0), x1 = (x0 + 1) % cx;
      const a = g[y0 * cx + x0], b = g[y0 * cx + x1], c = g[y1 * cx + x0], d = g[y1 * cx + x1];
      out[y * w + x] += amp * ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty);
    }
  }
}

// Fractal noise in [0,1]. sx/sy stretch the lattice (sy < sx gives streaks along y).
export function fbm(w, h, { cells = 4, oct = 5, gain = 0.5, seed = 1, sx = 1, sy = 1 } = {}) {
  const rand = makeRand(seed);
  const out = new Float32Array(w * h);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const c = cells * (1 << o);
    valueNoise(w, h, Math.max(1, Math.round(c * sx)), Math.max(1, Math.round(c * sy)), rand, out, amp);
    tot += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

function toTex(c, { srgb = true, repeat = null, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.needsUpdate = true;
  return t;
}

function paint(w, h, fn) {
  const [c, x] = cnv(w, h);
  const img = x.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < w * h; i++) {
    const [r, g, b] = fn(i, i % w, (i / w) | 0);
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return [c, x];
}

const lerp = (a, b, t) => a + (b - a) * t;
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ------------------------------------------------------------------ cricket ball leather
// Equirectangular, 2:1. Canvas top = north pole, the seam runs along the equator.
export function leather() {
  const W = 2048, H = 1024;
  const low = fbm(W, H, { cells: 6, oct: 4, seed: 11, sx: 2 });
  const fine = fbm(W, H, { cells: 64, oct: 3, seed: 12, sx: 2 });
  const [cc, cx] = paint(W, H, i => {
    const t = Math.min(1, Math.max(0, (low[i] - 0.3) * 1.6));
    const base = mixc([74, 8, 7], [128, 20, 16], t);
    const f = (fine[i] - 0.5) * 34;
    return [base[0] + f, base[1] + f * 0.25, base[2] + f * 0.2];
  });
  // bump: pores + the groove where the two halves meet + quarter-seam lines
  const rand = makeRand(13);
  const [bc, bx] = paint(W, H, i => { const v = 150 + (fine[i] - 0.5) * 90; return [v, v, v]; });
  bx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 26000; i++) { bx.beginPath(); bx.arc(rand() * W, rand() * H, 0.6 + rand() * 1.3, 0, 7); bx.fill(); }
  bx.fillStyle = 'rgb(20,20,20)'; bx.fillRect(0, H / 2 - 2, W, 4);
  bx.strokeStyle = 'rgba(40,40,40,.9)'; bx.lineWidth = 2;
  for (const u of [0.125, 0.625]) { bx.beginPath(); bx.moveTo(u * W, 0); bx.lineTo(u * W, H); bx.stroke(); }

  // gold foil stamp on one face, well clear of the seam
  const orm = document.createElement('canvas'); orm.width = W; orm.height = H;
  const ox = orm.getContext('2d');
  ox.fillStyle = 'rgb(0,118,0)'; ox.fillRect(0, 0, W, H);          // G = roughness .46, B = metalness 0
  const stamp = (ctx, fill) => {
    ctx.save();
    ctx.fillStyle = fill; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 58px "Cormorant Garamond"';
    ctx.letterSpacing = '10px';
    ctx.fillText('KINGSGROVE', W * 0.25, H * 0.345);
    ctx.font = '500 26px "Montserrat"'; ctx.letterSpacing = '14px';
    ctx.fillText('SPORTS', W * 0.25, H * 0.39);
    ctx.fillRect(W * 0.25 - 150, H * 0.308, 300, 3);
    ctx.fillRect(W * 0.25 - 150, H * 0.413, 300, 3);
    ctx.restore();
  };
  stamp(cx, '#caa04a');
  stamp(ox, 'rgb(0,70,255)');
  stamp(bx, 'rgb(120,120,120)');
  return {
    map: toTex(cc), bump: toTex(bc, { srgb: false }), orm: toTex(orm, { srgb: false }),
  };
}

// ------------------------------------------------------------------ english willow
export function willow(seed = 21) {
  const W = 1024, H = 2048;
  const low = fbm(W, H, { cells: 3, oct: 3, seed, sy: 3 });
  const streak = fbm(W, H, { cells: 40, oct: 3, seed: seed + 1, sx: 4, sy: 0.12 });
  const [c, x] = paint(W, H, i => {
    const base = mixc([226, 204, 156], [242, 222, 178], low[i]);
    const s = (streak[i] - 0.5) * 38;
    return [base[0] + s, base[1] + s * 0.9, base[2] + s * 0.7];
  });
  const [bc, bx] = paint(W, H, i => { const v = 128 + (streak[i] - 0.5) * 60; return [v, v, v]; });
  const rand = makeRand(seed + 2);
  // straight grain lines, gently wandering
  for (let g = 0; g < 26; g++) {
    const x0 = rand() * W, amp = 3 + rand() * 10, f = 0.002 + rand() * 0.004, ph = rand() * 6;
    const w = 1 + rand() * 3.5, a = 0.18 + rand() * 0.3;
    for (const [ctx, col] of [[x, `rgba(150,105,52,${a})`], [bx, `rgba(40,40,40,${a})`]]) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
      for (let y = 0; y <= H; y += 16) {
        const px = x0 + Math.sin(y * f + ph) * amp;
        y ? ctx.lineTo(px, y) : ctx.moveTo(px, y);
      }
      ctx.stroke();
    }
  }
  // willow speckle ("butterfly") marks
  for (let k = 0; k < 90; k++) {
    const px = rand() * W, py = rand() * H, l = 6 + rand() * 20;
    x.fillStyle = `rgba(120,80,40,${0.15 + rand() * 0.25})`;
    x.beginPath(); x.ellipse(px, py, 1.5 + rand() * 2, l, 0, 0, 7); x.fill();
  }
  return { map: toTex(c), bump: toTex(bc, { srgb: false }) };
}

// ------------------------------------------------------------------ rubber grip
export function grip() {
  const W = 256, H = 256;
  const n = fbm(W, H, { cells: 16, oct: 2, seed: 31 });
  const [c] = paint(W, H, (i, px, py) => {
    const rib = 0.5 + 0.5 * Math.sin((py / H) * Math.PI * 2 * 10 + Math.sin(px / W * Math.PI * 2) * 1.5);
    const v = 18 + rib * 22 + (n[i] - 0.5) * 12;
    return [v * 1.25, v * 0.7, v * 0.6];
  });
  const [b] = paint(W, H, (i, px, py) => {
    const rib = 0.5 + 0.5 * Math.sin((py / H) * Math.PI * 2 * 10 + Math.sin(px / W * Math.PI * 2) * 1.5);
    const v = 60 + rib * 150; return [v, v, v];
  });
  return { map: toTex(c, { repeat: [1, 6] }), bump: toTex(b, { srgb: false, repeat: [1, 6] }) };
}

// ------------------------------------------------------------------ surfaces
export function concrete(seed = 41, tint = [58, 60, 62]) {
  const W = 1024, H = 1024;
  const n = fbm(W, H, { cells: 4, oct: 6, seed });
  const s = fbm(W, H, { cells: 2, oct: 3, seed: seed + 5 });
  const [c] = paint(W, H, i => {
    const v = (n[i] - 0.5) * 40 - Math.max(0, s[i] - 0.55) * 60;
    return [tint[0] + v, tint[1] + v, tint[2] + v];
  });
  const [b] = paint(W, H, i => { const v = n[i] * 255; return [v, v, v]; });
  return { map: toTex(c, { repeat: [2, 2] }), bump: toTex(b, { srgb: false, repeat: [2, 2] }) };
}

export function asphalt() {
  const W = 1024, H = 1024;
  const n = fbm(W, H, { cells: 8, oct: 5, seed: 51 });
  const pud = fbm(W, H, { cells: 3, oct: 4, seed: 52 });
  const rand = makeRand(53);
  const [c, x] = paint(W, H, i => {
    const wet = pud[i] > 0.56 ? 1 : 0;
    const v = 30 + (n[i] - 0.5) * 26 - wet * 12;
    return [v, v + 1, v + 3];
  });
  for (let k = 0; k < 16000; k++) {
    const g = 50 + rand() * 40;
    x.fillStyle = `rgba(${g},${g},${g},${0.12 + rand() * 0.18})`;
    x.fillRect(rand() * W, rand() * H, 1 + rand() * 2, 1 + rand() * 2);
  }
  // roughness (G): puddles are mirror-smooth
  const [r] = paint(W, H, i => {
    const t = Math.min(1, Math.max(0, (pud[i] - 0.5) * 12));
    const v = lerp(175, 18, t) + (n[i] - 0.5) * 30;
    return [0, v, 0];
  });
  const [b] = paint(W, H, i => { const v = pud[i] > 0.56 ? 128 : 100 + n[i] * 120; return [v, v, v]; });
  return {
    map: toTex(c, { repeat: [3, 3] }), rough: toTex(r, { srgb: false, repeat: [3, 3] }), bump: toTex(b, { srgb: false, repeat: [3, 3] }),
  };
}

export function grass() {
  const W = 1024, H = 1024;
  const n = fbm(W, H, { cells: 32, oct: 3, seed: 61 });
  const l = fbm(W, H, { cells: 3, oct: 3, seed: 62 });
  const [c] = paint(W, H, (i, px) => {
    const stripe = Math.floor(px / (W / 4)) % 2 ? 1.1 : 0.92;
    const v = (0.6 + n[i] * 0.6) * stripe * (0.8 + l[i] * 0.4);
    return [26 * v, 44 * v, 22 * v];
  });
  return { map: toTex(c, { repeat: [8, 8] }) };
}

// Pitch strip, 3.05 m x 20.12 m, drawn 512 x 3376 px (6 px/cm).
export function pitch() {
  const W = 512, H = 3376, PX = W / 3.05;
  const n = fbm(W, H, { cells: 6, oct: 6, seed: 71, sy: 6 });
  const g = fbm(W, H, { cells: 40, oct: 2, seed: 72, sy: 6 });
  const [c, x] = paint(W, H, i => {
    const worn = Math.max(0, g[i] - 0.45) * 1.4;
    const dirt = mixc([128, 108, 76], [150, 130, 96], n[i]);
    return mixc(dirt, [70, 84, 50], Math.max(0, 0.35 - worn));
  });
  const rand = makeRand(73);
  x.strokeStyle = 'rgba(60,45,30,.55)';
  for (let k = 0; k < 140; k++) {
    x.lineWidth = 0.6 + rand() * 1.4; x.beginPath();
    let px = rand() * W, py = rand() * H; x.moveTo(px, py);
    for (let s = 0; s < 8; s++) { px += (rand() - 0.5) * 40; py += (rand() - 0.5) * 40; x.lineTo(px, py); }
    x.stroke();
  }
  // crease markings at both ends (stumps sit on the bowling crease)
  x.fillStyle = 'rgba(238,236,226,.92)';
  for (const end of [0, 1]) {
    const sy = end ? H - 1.22 * PX : 1.22 * PX;           // bowling crease line
    const py = end ? sy - 1.22 * PX : sy + 1.22 * PX;     // popping crease
    x.fillRect(W / 2 - 1.32 * PX, sy - 3, 2.64 * PX, 6);
    x.fillRect(0, py - 3, W, 6);
    for (const s of [-1, 1]) x.fillRect(W / 2 + s * 1.32 * PX - 3, Math.min(sy, py) - 0.3 * PX, 6, Math.abs(py - sy) + 0.6 * PX);
  }
  return { map: toTex(c) };
}

// ------------------------------------------------------------------ props
export function marker(num) {
  const [c, x] = cnv(256, 320);
  x.fillStyle = '#f1c21b'; x.fillRect(0, 0, 256, 320);
  const rand = makeRand(80 + num);
  for (let k = 0; k < 900; k++) { x.fillStyle = `rgba(90,60,0,${rand() * 0.12})`; x.fillRect(rand() * 256, rand() * 320, 2, 2); }
  x.fillStyle = '#111'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '400 230px "Bebas Neue"'; x.fillText(String(num), 128, 176);
  x.font = '500 20px Montserrat'; x.letterSpacing = '4px'; x.fillText('EVIDENCE', 128, 36);
  return toTex(c);
}

export function tape() {
  const [c, x] = cnv(2048, 96);
  x.fillStyle = '#f2c10f'; x.fillRect(0, 0, 2048, 96);
  x.fillStyle = '#121212'; x.font = '400 64px "Bebas Neue"'; x.letterSpacing = '6px'; x.textBaseline = 'middle';
  let px = 20;
  for (let k = 0; k < 6; k++) {
    const s = k % 2 ? 'DO NOT CROSS' : 'BOUNDARY';
    x.fillText(s, px, 52); px += x.measureText(s).width + 70;
  }
  return toTex(c, { repeat: [3, 1] });
}

// Chalk outline of a cricket bat, as a transparent decal.
export function chalkBat() {
  const W = 512, H = 1400;
  const [c, x] = cnv(W, H);
  const rand = makeRand(91);
  const pts = [];
  const add = (px, py) => pts.push([px, py]);
  // handle, shoulders, blade, rounded toe (outline, clockwise)
  add(226, 40); add(286, 40); add(292, 420); add(360, 470); add(372, 520);
  for (let yy = 520; yy <= 1260; yy += 40) add(376, yy);
  for (let a = 0; a <= Math.PI; a += Math.PI / 12) add(256 + Math.cos(a) * 120, 1260 + Math.sin(a) * 60);
  for (let yy = 1260; yy >= 520; yy -= 40) add(136, yy);
  add(140, 520); add(152, 470); add(220, 420); add(226, 40);
  for (let pass = 0; pass < 7; pass++) {
    x.strokeStyle = `rgba(240,240,236,${0.18 + rand() * 0.2})`;
    x.lineWidth = 4 + rand() * 5; x.lineJoin = 'round'; x.beginPath();
    pts.forEach(([px, py], i) => {
      const jx = px + (rand() - 0.5) * 6, jy = py + (rand() - 0.5) * 6;
      i ? x.lineTo(jx, jy) : x.moveTo(jx, jy);
    });
    x.stroke();
  }
  // chalk dust breakup
  x.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 9000; k++) { x.fillStyle = `rgba(0,0,0,${rand() * 0.7})`; x.fillRect(rand() * W, rand() * H, 2, 2); }
  return toTex(c);
}

export function blinds() {
  const [c, x] = cnv(512, 512);
  x.fillStyle = '#000'; x.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 13; k++) {
    const y = 20 + k * 37;
    const g = x.createLinearGradient(0, y, 0, y + 24);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.25, '#fff'); g.addColorStop(0.8, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(40, y, 432, 24);
  }
  x.fillStyle = '#000'; x.fillRect(250, 0, 14, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}

export function softDot() {
  const [c, x] = cnv(64, 64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return toTex(c, { aniso: 1 });
}

export function darkWood() {
  const W = 1024, H = 1024;
  const n = fbm(W, H, { cells: 30, oct: 3, seed: 101, sx: 0.08, sy: 1 });
  const l = fbm(W, H, { cells: 3, oct: 3, seed: 102 });
  const [c] = paint(W, H, i => {
    const v = 0.55 + n[i] * 0.7 + (l[i] - 0.5) * 0.3;
    return [58 * v, 36 * v, 24 * v];
  });
  const [b] = paint(W, H, i => { const v = n[i] * 255; return [v, v, v]; });
  return { map: toTex(c, { repeat: [2, 2] }), bump: toTex(b, { srgb: false, repeat: [2, 2] }) };
}

// ------------------------------------------------------------------ the scorebook (two pages)
export const SCORE = { W: 2048, H: 1400 };
export function scorebook() {
  const { W, H } = SCORE;
  const fib = fbm(W, H, { cells: 60, oct: 2, seed: 111, sx: 3 });
  const age = fbm(W, H, { cells: 3, oct: 3, seed: 112 });
  const [c, x] = paint(W, H, (i, px, py) => {
    const ex = Math.min(px, W - px, Math.abs(px - W / 2) * 3, py, H - py) / 120;
    const edge = Math.max(0, 1 - Math.min(1, ex)) * 40;
    const v = 236 - edge - (age[i] - 0.5) * 18 + (fib[i] - 0.5) * 10;
    return [v, v - 6, v - 20];
  });
  const ruled = 'rgba(70,110,150,.55)';
  const head = (s, px, py, size = 22, align = 'left') => {
    x.fillStyle = '#2d4d63'; x.font = `500 ${size}px Montserrat`; x.letterSpacing = '3px'; x.textAlign = align; x.fillText(s, px, py);
  };
  const hand = (s, px, py, size = 50, col = '#1d2a4a', rot = 0) => {
    x.save(); x.translate(px, py); x.rotate(rot); x.fillStyle = col; x.font = `700 ${size}px Caveat`; x.letterSpacing = '0px';
    x.textAlign = 'left'; x.fillText(s, 0, 0); x.restore();
  };
  // left page: batting
  head('INNINGS OF', 90, 110, 20); hand('Home XI', 260, 112, 46);
  head('VERSUS', 600, 110, 20); hand('Visitors', 720, 112, 46);
  const cols = [90, 170, 470, 640, 800, 930];
  const top = 170, rowH = 104;
  head('No.', 100, top + 42, 18); head('BATTER', 180, top + 42, 18); head('HOW OUT', 480, top + 42, 18);
  head('BOWLER', 650, top + 42, 18); head('RUNS', 810, top + 42, 18);
  x.strokeStyle = ruled; x.lineWidth = 2;
  for (let r = 0; r <= 10; r++) { x.beginPath(); x.moveTo(80, top + 60 + r * rowH); x.lineTo(960, top + 60 + r * rowH); x.stroke(); }
  for (const cx0 of cols) { x.beginPath(); x.moveTo(cx0, top); x.lineTo(cx0, top + 60 + 10 * rowH); x.stroke(); }
  const rows = [
    ['A. Stone', 'c Webb', 'Harris', '14'],
    ['R. Hale', 'lbw', 'Doyle', '23'],
    ['T. Moss', 'bowled', '???', '0'],
    ['J. Price', 'run out', '', '4'],
    ['K. Varga', 'not out', '', '31'],
  ];
  rows.forEach(([n, how, bw, runs], r) => {
    const y = top + 60 + r * rowH + 72;
    hand(String(r + 1), 110, y, 44);
    hand(n, 186, y, 50, '#1d2a4a', -0.01);
    hand(how, 482, y, 46);
    hand(bw, 656, y, 46);
    hand(runs, 832, y, 54);
  });
  // right page: bowling analysis + notes
  head('BOWLING', 1110, 110, 20);
  for (let r = 0; r <= 6; r++) { x.beginPath(); x.moveTo(1100, top + 60 + r * rowH); x.lineTo(1960, top + 60 + r * rowH); x.stroke(); }
  for (const cx0 of [1100, 1400, 1520, 1640, 1760, 1960]) { x.beginPath(); x.moveTo(cx0, top); x.lineTo(cx0, top + 60 + 6 * rowH); x.stroke(); }
  head('BOWLER', 1110, top + 42, 18); head('O', 1440, top + 42, 18); head('M', 1560, top + 42, 18); head('R', 1680, top + 42, 18); head('W', 1800, top + 42, 18);
  [['Harris', '6', '1', '22', '1'], ['Doyle', '5', '0', '31', '1'], ['???', '1', '1', '0', '1']].forEach((r, i) => {
    const y = top + 60 + i * rowH + 72;
    hand(r[0], 1116, y, 48); hand(r[1], 1446, y, 48); hand(r[2], 1566, y, 48); hand(r[3], 1686, y, 48); hand(r[4], 1806, y, 48);
  });
  hand('no one saw the delivery.', 1130, 1040, 52, '#1d2a4a', -0.03);
  hand('bails found 6 m behind the stumps.', 1130, 1110, 46, '#1d2a4a', -0.02);
  // coffee ring
  x.strokeStyle = 'rgba(120,80,40,.28)'; x.lineWidth = 9;
  x.beginPath(); x.arc(1760, 1200, 92, 0.2, 6.0); x.stroke();
  x.lineWidth = 3; x.beginPath(); x.arc(1764, 1196, 84, 0, 6.28); x.stroke();
  // gutter shadow
  const g = x.createLinearGradient(W / 2 - 60, 0, W / 2 + 60, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(40,30,20,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(W / 2 - 60, 0, 120, H);
  return toTex(c);
}
// Where the duck sits on the scorebook canvas (for the red circle and the camera).
export const DUCK = { x: 840, y: 170 + 60 + 2 * 104 + 56 };

// Red pen circle drawn progressively; p in [0,1].
export function redCircle() {
  const [c, x] = cnv(512, 512);
  const tex = toTex(c, { aniso: 4 });
  const rand = makeRand(121);
  const wob = Array.from({ length: 64 }, () => rand());
  tex.draw = p => {
    x.clearRect(0, 0, 512, 512);
    if (p <= 0) { tex.needsUpdate = true; return; }
    x.strokeStyle = 'rgba(176,18,22,.92)'; x.lineWidth = 11; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath();
    const end = p * Math.PI * 2 * 1.12;
    for (let a = 0; a <= end; a += 0.05) {
      const k = Math.floor(a / (Math.PI * 2) * 64) % 64;
      const r = 150 + wob[k] * 8 + a * 4;
      const px = 256 + Math.cos(a - 2.2) * r * 1.25, py = 256 + Math.sin(a - 2.2) * r * 0.82;
      a ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.stroke();
    tex.needsUpdate = true;
  };
  return tex;
}

export function bigDark() {
  const [c, x] = cnv(4, 4); x.fillStyle = '#000'; x.fillRect(0, 0, 4, 4);
  return toTex(c);
}
