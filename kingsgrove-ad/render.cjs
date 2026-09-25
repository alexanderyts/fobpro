#!/usr/bin/env node
// Renders ad.html frame-by-frame into an MP4, and exports the sound-cue timeline.
//
//   node render.cjs                     -> events.json + video-only.mp4 (then run soundtrack.py and mux, see README)
//   node render.cjs --stills 3,9.5,18   -> stills/still-<t>.png for quick checks
//
// Needs Playwright (Chromium) and an ffmpeg with libx264 (set FFMPEG=/path/to/ffmpeg if it isn't on PATH).
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
  const stillsArg = args.includes('--stills') ? args[args.indexOf('--stills') + 1] : null;
  const ffmpeg = process.env.FFMPEG || 'ffmpeg';

  const launch = { args: ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none'] };
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('page error:', e); process.exitCode = 1; });
  await page.goto('file://' + path.join(dir, 'ad.html') + '?capture=1');
  await page.waitForFunction(() => window.AD_READY === true);

  const shot = t => page.evaluate(t => window.AD.renderAt(t), t).then(() => page.screenshot({ type: 'png' }));

  if (stillsArg) {
    fs.mkdirSync(path.join(dir, 'stills'), { recursive: true });
    for (const t of stillsArg.split(',').map(Number)) {
      fs.writeFileSync(path.join(dir, 'stills', `still-${t.toFixed(2)}.png`), await shot(t));
      console.log('still', t);
    }
    await browser.close();
    return;
  }

  const { DURATION, FPS } = await page.evaluate(() => ({ DURATION: window.AD.DURATION, FPS: window.AD.FPS }));
  fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(await page.evaluate(() => window.AD.events()), null, 1));

  const out = path.join(dir, 'video-only.mp4');
  const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exited ' + c))));

  const frames = Math.round(DURATION * FPS);
  for (let f = 0; f < frames; f++) {
    const buf = await shot(f / FPS);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 75 === 0) console.log(`frame ${f}/${frames}`);
  }
  ff.stdin.end();
  await done;
  await browser.close();
  console.log('wrote', out);
})().catch(e => { console.error(e); process.exit(1); });
