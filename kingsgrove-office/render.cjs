#!/usr/bin/env node
// Renders index.html frame by frame in headless Chromium and pipes the frames to ffmpeg.
//
//   node render.cjs                         -> video-only.mp4 + events.json
//   node render.cjs --stills 3,9.5,15.2     -> stills/still-<t>.png
//   node render.cjs --range 0,10 --out part.mp4   (render part of the timeline)
//
// Needs Playwright and an ffmpeg with libx264 (FFMPEG=/path/to/ffmpeg).
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

function loadPlaywright() {
  try { return require('playwright'); } catch {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}

(async () => {
  const { chromium } = loadPlaywright();
  const dir = __dirname;
  const args = process.argv.slice(2);
  const opt = k => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
  const ffmpeg = process.env.FFMPEG || 'ffmpeg';

  const browser = await chromium.launch({
    args: ['--force-color-profile=srgb', '--font-render-hinting=none'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('page error:', e); process.exitCode = 1; });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error('console:', m.text()); });
  await page.goto('file://' + path.join(dir, 'index.html'));
  await page.waitForFunction(() => window.OFFICE_READY === true, null, { timeout: 180000 });
  const err = null;
  if (err) throw new Error(err);

  const shot = async t => {
    await page.evaluate(t => window.OFFICE.renderAt(t), t);
    return page.screenshot({ type: 'png' });
  };

  const stills = opt('--stills');
  if (stills) {
    fs.mkdirSync(path.join(dir, 'stills'), { recursive: true });
    for (const t of stills.split(',').map(Number)) {
      const t0 = Date.now();
      fs.writeFileSync(path.join(dir, 'stills', `still-${t.toFixed(2)}.png`), await shot(t));
      console.log('still', t, `${Date.now() - t0} ms`);
    }
    await browser.close();
    return;
  }

  const { DURATION, FPS } = await page.evaluate(() => ({ DURATION: window.OFFICE.DURATION, FPS: window.OFFICE.FPS }));
  fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(await page.evaluate(() => window.OFFICE.events()), null, 1));
  const [a, b] = (opt('--range') || `0,${DURATION}`).split(',').map(Number);
  const out = path.join(dir, opt('--out') || 'video-only.mp4');
  const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
  { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
  const f0 = Math.round(a * FPS), f1 = Math.round(b * FPS);
  const start = Date.now();
  for (let f = f0; f < f1; f++) {
    const buf = await shot(f / FPS);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if ((f - f0) % 48 === 0) {
      const el = (Date.now() - start) / 1000, per = el / (f - f0 + 1);
      console.log(`frame ${f}/${f1}  ${per.toFixed(2)} s/frame  eta ${((f1 - f) * per / 60).toFixed(1)} min`);
    }
  }
  ff.stdin.end();
  await done;
  await browser.close();
  console.log('wrote', out);
})().catch(e => { console.error(e); process.exit(1); });
