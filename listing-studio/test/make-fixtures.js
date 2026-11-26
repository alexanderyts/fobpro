// Generates synthetic "listing shoot" footage so the pipeline can be exercised
// without real camera files. Each clip mimics a real-world problem the editor
// must fix: shaky starts, colour casts, under-exposure, 60 fps slow-mo, a
// vertical phone clip, a static tripod shot and a drone clip.
//
//   node test/make-fixtures.js [outDir]

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFFmpeg } from '../server/media/ffmpeg.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FONT = path.resolve(here, '../assets/fonts/PlexSans-500.ttf');

// shake(t) only during the first `a` seconds and last `b` seconds of the clip.
const jolt = (amp, dur, a = 0.9, b = 0.6) =>
  `if(lt(t\\,${a})\\,${amp}*sin(t*41)*cos(t*17)\\,0)+if(gt(t\\,${dur - b})\\,${amp}*sin(t*37+2)\\,0)`;

export const FIXTURES = [
  {
    name: 'IMG_2201.MOV', label: 'KITCHEN', room: 'kitchen', fps: 30, dur: 7,
    c0: '0x9aa4ad', c1: '0xe8edf2', tint: 'colorchannelmixer=rr=0.9:bb=1.1',
    motion: { x: (d) => `60+t*28+${jolt(16, d)}`, y: (d) => `80+${jolt(10, d)}` },
  },
  {
    name: 'DJI_0042.MP4', label: 'AERIAL', room: 'aerial', fps: 30, dur: 8,
    c0: '0x4f6b3a', c1: '0x9cc3e6', tint: null,
    motion: { x: () => '40+t*30', y: () => '100-t*6' }, meta: ['-metadata', 'make=DJI', '-metadata', 'model=FC8482'],
  },
  {
    name: 'IMG_2202.MOV', label: 'LIVING ROOM', room: 'living', fps: 30, dur: 8,
    c0: '0x5b4a3a', c1: '0xb79c80', tint: 'colorchannelmixer=rr=1.1:bb=0.86,eq=brightness=-0.1:gamma=0.82',
    motion: { x: (d) => `300-t*26+${jolt(22, d)}`, y: (d) => `90+${jolt(14, d)}` },
  },
  {
    name: 'IMG_2200.MOV', label: 'FRONT EXTERIOR', room: 'exterior', fps: 60, dur: 6,
    c0: '0x6e7f8f', c1: '0xd9e2ea', tint: null,
    motion: { x: (d) => `80+t*22+${jolt(14, d, 0.7, 0.5)}`, y: () => '90' },
  },
  {
    name: 'IMG_2203.MOV', label: 'PRIMARY BEDROOM', room: 'primary_bedroom', fps: 30, dur: 7,
    c0: '0x7d7468', c1: '0xd8cfc2', tint: null, portrait: true,
    motion: { x: () => '120', y: (d) => `60+t*24+${jolt(12, d)}` },
  },
  {
    name: 'IMG_2204.MOV', label: 'PRIMARY BATH', room: 'primary_bath', fps: 30, dur: 6,
    c0: '0x8f9aa0', c1: '0xf1f3f4', tint: null,
    motion: { x: () => '160', y: () => '90' },
  },
];

async function makeClip(outDir, fx, index) {
  const W = fx.portrait ? 720 : 1280;
  const H = fx.portrait ? 1280 : 720;
  const CW = W + 400;
  const CH = H + 260;
  const src =
    `gradients=s=${CW}x${CH}:c0=${fx.c0}:c1=${fx.c1}:x0=0:y0=0:x1=${CW}:y1=${CH}:speed=0.0001:r=${fx.fps}:d=${fx.dur}`;
  const scene = [
    // Simple "architecture": windows, a doorway, furniture blocks and a floor line.
    `drawbox=x=${Math.round(CW * 0.12)}:y=${Math.round(CH * 0.14)}:w=${Math.round(CW * 0.16)}:h=${Math.round(CH * 0.36)}:color=0xfbfaf6@0.95:t=fill`,
    `drawbox=x=${Math.round(CW * 0.34)}:y=${Math.round(CH * 0.14)}:w=${Math.round(CW * 0.16)}:h=${Math.round(CH * 0.36)}:color=0xfbfaf6@0.95:t=fill`,
    `drawbox=x=${Math.round(CW * 0.62)}:y=${Math.round(CH * 0.22)}:w=${Math.round(CW * 0.12)}:h=${Math.round(CH * 0.52)}:color=0x2e2924@0.9:t=fill`,
    `drawbox=x=0:y=${Math.round(CH * 0.74)}:w=${CW}:h=${Math.round(CH * 0.26)}:color=0x6b5844@0.85:t=fill`,
    `drawbox=x=${Math.round(CW * 0.18)}:y=${Math.round(CH * 0.6)}:w=${Math.round(CW * 0.38)}:h=${Math.round(CH * 0.16)}:color=0x45505a@0.95:t=fill`,
    `drawgrid=w=64:h=64:t=1:c=0x00000022`,
    `drawtext=fontfile='${FONT}':text='${fx.label}':fontsize=${Math.round(H * 0.06)}:fontcolor=0x1d1b18@0.55:x=${Math.round(CW * 0.15)}:y=${Math.round(CH * 0.58)}`,
  ].join(',');
  const cam = `crop=${W}:${H}:'${fx.motion.x(fx.dur)}':'${fx.motion.y(fx.dur)}'`;
  const vf = [scene, fx.tint, cam, 'format=yuv420p'].filter(Boolean).join(',');
  const created = new Date(Date.UTC(2026, 10, 20, 15, 0, index * 40)).toISOString();
  await runFFmpeg([
    '-f', 'lavfi', '-i', src,
    '-f', 'lavfi', '-i', `anoisesrc=d=${fx.dur}:c=pink:a=0.02`,
    '-vf', vf,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-r', String(fx.fps),
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-c:a', 'aac', '-b:a', '96k', '-shortest',
    '-metadata', `creation_time=${created}`,
    ...(fx.meta || []),
    '-f', 'mp4',
    path.join(outDir, fx.name),
  ]);
}

/** A 120 BPM four-on-the-floor bed with off-beat hats, so beat detection has ground truth. */
export async function makeMusic(outDir, { bpm = 120, dur = 75 } = {}) {
  const beat = 60 / bpm;
  const kick = `0.9*sin(2*PI*(48+70*exp(-28*mod(t\\,${beat})))*mod(t\\,${beat}))*exp(-9*mod(t\\,${beat}))`;
  const hat = `0.10*(random(0)*2-1)*exp(-60*mod(t+${beat / 2}\\,${beat}))`;
  const pad = `0.12*sin(2*PI*220*t)*0.5*(1+sin(2*PI*t/8))+0.08*sin(2*PI*277.18*t)+0.06*sin(2*PI*329.63*t)`;
  const file = path.join(outDir, 'music-120bpm.m4a');
  await runFFmpeg([
    '-f', 'lavfi', '-i', `aevalsrc='${kick}+${hat}+${pad}':s=44100:d=${dur}`,
    '-af', 'alimiter=limit=0.9', '-c:a', 'aac', '-b:a', '192k', file,
  ]);
  return file;
}

export async function makeFixtures(outDir) {
  await fs.mkdir(outDir, { recursive: true });
  await Promise.all(FIXTURES.map((fx, i) => makeClip(outDir, fx, i)));
  await makeMusic(outDir);
  return FIXTURES.map((f) => path.join(outDir, f.name));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = path.resolve(process.argv[2] || path.join(here, '../data/fixtures'));
  const t = Date.now();
  await makeFixtures(out);
  console.log(`Fixtures written to ${out} in ${((Date.now() - t) / 1000).toFixed(1)}s`);
}
