// Downloads the real (Pexels-licensed) test media described in test/REAL_MEDIA.md
// into data/real/. Needs network access to videos.pexels.com and images.pexels.com.
//   node test/fetch-real-media.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/real');
const videos = [];
for (let id = 7578540; id <= 7578555; id++) videos.push([`pexels-${id}.mp4`, `https://videos.pexels.com/video-files/${id}/${id}-hd_1920_1080_30fps.mp4`]);
videos.push(['pexels-31475213-aerial.mp4', 'https://videos.pexels.com/video-files/31475213/13420717_1440_2560_60fps.mp4']);
const photos = [8031873, 9976121, 4529496, 6422939, 8134845].map((id) => [`pexels-photo-${id}.jpg`, `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=2400`]);

async function get(dir, [name, url]) {
  const out = path.join(root, dir, name);
  try { await fs.access(out); return; } catch {}
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, Buffer.from(await res.arrayBuffer()));
  console.log('saved', path.join(dir, name));
}
for (const v of videos) await get('pexels', v);
for (const p of photos) await get('photos', p);
