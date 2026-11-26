// Title graphics rendered to transparent PNGs with ffmpeg's drawtext, so the
// same typography engine is used for preview stills and final renders.

import fs from 'node:fs/promises';
import path from 'node:path';
import { runFFmpeg, escapeFilterValue } from './ffmpeg.js';
import { FONTS } from '../config.js';

const THIN = ' ';
/** Simulated tracking for small caps labels (drawtext has no letter-spacing). */
export function track(text) {
  return [...String(text).toUpperCase()].join(THIN).replace(new RegExp(`${THIN} ${THIN}`, 'g'), `${THIN}${THIN} ${THIN}${THIN}`);
}

function hexColor(c, fallback = '#C9A86A') {
  const v = /^#?[0-9a-f]{6}$/i.test(c || '') ? c.replace('#', '') : fallback.replace('#', '');
  return `0x${v}`;
}

/** Approximate advance width per character, as a fraction of font size. */
const ADVANCE = { sans: 0.56, sansCaps: 0.68, serif: 0.5 };

function fitSize(text, base, maxWidth, kind) {
  const w = String(text).length * base * ADVANCE[kind];
  return w <= maxWidth ? base : Math.max(Math.round(base * 0.55), Math.floor(maxWidth / (String(text).length * ADVANCE[kind])));
}

export function formatDetails(details = {}) {
  const parts = [];
  if (details.beds) parts.push(`${details.beds} BD`);
  if (details.baths) parts.push(`${details.baths} BA`);
  if (details.sqft) parts.push(`${Number(String(details.sqft).replace(/[^0-9.]/g, '')).toLocaleString('en-US')} SQ FT`);
  if (details.price) {
    const n = Number(String(details.price).replace(/[^0-9.]/g, ''));
    parts.push(n ? `$${n.toLocaleString('en-US')}` : String(details.price));
  }
  return parts.join('   ·   ');
}

async function textFile(dir, name, text) {
  const p = path.join(dir, `${name}.txt`);
  await fs.writeFile(p, text, 'utf8');
  return p;
}

function drawtext({ file, font, size, color = 'white', alpha = 1, x, y }) {
  return (
    `drawtext=fontfile='${escapeFilterValue(font)}':textfile='${escapeFilterValue(file)}':expansion=none` +
    `:fontsize=${size}:fontcolor=${color}@${alpha}:x=${x}:y=${y}`
  );
}

/**
 * Lower-left opening title over the first shot: label, address, city, key facts.
 */
export async function renderIntroCard({ dir, width, height, project, brand, serif }) {
  await fs.mkdir(dir, { recursive: true });
  // Vertical frames are watched on phones: set type a size up.
  const k = (Math.min(width, height) / 1080) * (height > width ? 1.28 : 1);
  const portrait = height > width;
  const margin = Math.round((portrait ? 72 : 104) * k);
  const maxW = width - margin * 2;
  const accent = hexColor(brand?.accentColor);

  const label = track(project.label || 'Just listed');
  const address = project.address?.line1 || project.name || '';
  const cityLine = [project.address?.city, [project.address?.state, project.address?.zip].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const facts = formatDetails(project.details);

  const addrKind = serif ? 'serif' : 'sans';
  const addrSize = fitSize(address, Math.round((serif ? 96 : 70) * k), maxW, addrKind);
  const citySize = Math.round(30 * k);
  const labelSize = Math.round(20 * k);
  const factsSize = fitSize(facts, Math.round(23 * k), maxW, 'sansCaps');

  // Stack from the bottom up.
  const bottom = height - Math.round((portrait ? 300 : 120) * k);
  const yFacts = bottom - factsSize;
  const yCity = yFacts - Math.round(26 * k) - citySize;
  const yAddr = yCity - Math.round((serif ? 8 : 14) * k) - Math.round(addrSize * (serif ? 1.02 : 1.0));
  const yLabel = yAddr - Math.round(30 * k) - labelSize;
  const yRule = yLabel - Math.round(22 * k);

  const files = {
    label: await textFile(dir, 'label', label),
    address: await textFile(dir, 'address', address),
    city: await textFile(dir, 'city', cityLine),
    facts: await textFile(dir, 'facts', facts),
  };

  const layers = [
    // Bottom scrim for legibility over bright interiors.
    `geq=r=0:g=0:b=0:a='255*0.66*pow(clip((Y-H*${portrait ? 0.42 : 0.38})/(H*${portrait ? 0.58 : 0.62})\\,0\\,1)\\,1.5)'`,
    `drawbox=x=${margin}:y=${yRule}:w=${Math.round(44 * k)}:h=${Math.max(2, Math.round(2 * k))}:color=${accent}@1:t=fill:replace=1`,
    drawtext({ file: files.label, font: FONTS.sansSemibold, size: labelSize, alpha: 0.92, x: margin, y: yLabel }),
    drawtext({ file: files.address, font: serif ? FONTS.serif : FONTS.sansMedium, size: addrSize, x: margin, y: yAddr }),
  ];
  if (cityLine) layers.push(drawtext({ file: files.city, font: FONTS.sansRegular, size: citySize, alpha: 0.88, x: margin, y: yCity }));
  if (facts) layers.push(drawtext({ file: files.facts, font: FONTS.sansMedium, size: factsSize, alpha: 0.8, x: margin, y: yFacts }));

  const out = path.join(dir, 'intro.png');
  await runFFmpeg([
    '-f', 'lavfi', '-i', `color=c=black@0.0:s=${width}x${height}:d=1,format=rgba`,
    '-vf', layers.join(','),
    '-frames:v', '1', out,
  ]);
  return out;
}

/**
 * Closing agent card (branded deliverables only). Drawn over a blurred still of
 * the final shot by the renderer.
 */
export async function renderOutroCard({ dir, width, height, project, brand, serif }) {
  await fs.mkdir(dir, { recursive: true });
  // Vertical frames are watched on phones: set type a size up.
  const k = (Math.min(width, height) / 1080) * (height > width ? 1.28 : 1);
  const maxW = width - Math.round(160 * k);
  const accent = hexColor(brand?.accentColor);

  const name = brand?.agentName || '';
  const role = [brand?.agentTitle, brand?.brokerage].filter(Boolean).join('  ·  ');
  const contact = [brand?.phone, brand?.email].filter(Boolean).join('     ');
  const web = brand?.website || '';

  const nameSize = fitSize(name, Math.round((serif ? 92 : 66) * k), maxW, serif ? 'serif' : 'sans');
  const roleSize = fitSize(track(role), Math.round(20 * k), maxW, 'sansCaps');
  const contactSize = fitSize(contact, Math.round(30 * k), maxW, 'sans');
  const webSize = Math.round(24 * k);

  const files = {
    name: await textFile(dir, 'name', name),
    role: await textFile(dir, 'role', track(role)),
    contact: await textFile(dir, 'contact', contact),
    web: await textFile(dir, 'web', web),
  };

  const hasLogo = Boolean(brand?.logoPath);
  const logoH = Math.round((height > width ? 150 : 120) * k);
  const gap = Math.round(36 * k);
  // Block height, so the whole card is vertically centred.
  const blockH =
    (hasLogo ? logoH + gap * 1.4 : 0) +
    nameSize + gap * 0.9 + roleSize + gap * 1.5 +
    (contact ? contactSize + gap * 0.7 : 0) + (web ? webSize : 0);
  let y = Math.round((height - blockH) / 2);
  const yLogo = y;
  if (hasLogo) y += Math.round(logoH + gap * 1.4);
  const yName = y; y += Math.round(nameSize + gap * 0.9);
  const yRole = y; y += Math.round(roleSize + gap * 1.5);
  const yRule = yRole + roleSize + Math.round(gap * 0.7);
  const yContact = y; y += Math.round(contactSize + gap * 0.7);
  const yWeb = y;

  const center = '(w-text_w)/2';
  const layers = [
    `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.5:t=fill:replace=1`,
    drawtext({ file: files.name, font: serif ? FONTS.serif : FONTS.sansMedium, size: nameSize, x: center, y: yName }),
  ];
  if (role) layers.push(drawtext({ file: files.role, font: FONTS.sansSemibold, size: roleSize, alpha: 0.85, x: center, y: yRole }));
  layers.push(`drawbox=x=(iw-${Math.round(40 * k)})/2:y=${yRule}:w=${Math.round(40 * k)}:h=${Math.max(2, Math.round(2 * k))}:color=${accent}@1:t=fill:replace=1`);
  if (contact) layers.push(drawtext({ file: files.contact, font: FONTS.sansRegular, size: contactSize, alpha: 0.95, x: center, y: yContact }));
  if (web) layers.push(drawtext({ file: files.web, font: FONTS.sansRegular, size: webSize, alpha: 0.75, x: center, y: yWeb }));

  const out = path.join(dir, 'outro.png');
  const args = ['-f', 'lavfi', '-i', `color=c=black@0.0:s=${width}x${height}:d=1,format=rgba`];
  if (hasLogo) {
    args.push('-i', brand.logoPath);
    args.push(
      '-filter_complex',
      `[0:v]${layers.join(',')}[base];[1:v]scale='min(${maxW}\\,iw*${logoH}/ih)':-1:flags=lanczos,format=rgba[logo];` +
        `[base][logo]overlay=x=(W-w)/2:y=${yLogo}:format=auto`,
    );
  } else {
    args.push('-vf', layers.join(','));
  }
  args.push('-frames:v', '1', out);
  await runFFmpeg(args);
  return out;
}
