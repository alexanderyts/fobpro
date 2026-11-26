// End-to-end: synthetic footage → analysis → plan → rendered MP4.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { makeFixtures, FIXTURES, makeMusic } from './make-fixtures.js';
import { probe } from '../server/media/probe.js';
import { analyzeClip } from '../server/media/analyze.js';
import { analyzeMusic } from '../server/media/beats.js';
import { buildPlan, autoOrder } from '../server/media/plan.js';
import { renderDeliverable } from '../server/media/render.js';
import { runFFprobe } from '../server/media/ffmpeg.js';

process.env.RENDER_PRESET = 'ultrafast';

test('pipeline: analyse fixtures and render a branded reel', { timeout: 240000 }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ls-pipe-'));
  try {
    await makeFixtures(dir);
    const clips = [];
    for (const fx of FIXTURES) {
      const file = path.join(dir, fx.name);
      const meta = await probe(file, fx.name);
      const analysis = await analyzeClip({ file, meta, workDir: path.join(dir, 'work', fx.name) });
      clips.push({ id: fx.name, file, originalName: fx.name, meta, analysis, room: fx.room, status: 'ready', include: true });
    }
    const byName = Object.fromEntries(clips.map((c) => [c.id, c]));

    // Analysis expectations from how the fixtures were made.
    assert.equal(byName['DJI_0042.MP4'].meta.isDrone, true);
    assert.equal(byName['IMG_2203.MOV'].meta.orientation, 'portrait');
    assert.equal(byName['IMG_2200.MOV'].meta.fps, 60);
    assert.ok(byName['IMG_2202.MOV'].analysis.trimIn > 0.8, 'living room shaky start trimmed');
    assert.ok(byName['IMG_2202.MOV'].analysis.trimOut < 7.5, 'living room shaky end trimmed');
    assert.ok(byName['IMG_2202.MOV'].analysis.flags.includes('warm-cast'));
    assert.ok(byName['IMG_2204.MOV'].analysis.flags.includes('static'));

    const ordered = autoOrder(clips).map((id) => byName[id]);
    assert.deepEqual(ordered.map((c) => c.room), ['aerial', 'exterior', 'living', 'kitchen', 'primary_bedroom', 'primary_bath']);

    const musicFile = await makeMusic(dir, { dur: 40 });
    const music = { file: musicFile, analysis: await analyzeMusic(musicFile) };
    const settings = { style: 'walkthrough', fps: 30, slowmo: true, look: 'bright', gradeStrength: 0.8 };
    const plan = buildPlan({ clips: ordered, music, settings, formatId: 'reel' });
    assert.ok(!plan.error, plan.error);

    const out = path.join(dir, 'reel.mp4');
    const res = await renderDeliverable({
      plan,
      project: { name: '12 Test St', label: 'Just listed', address: { line1: '12 Test St', city: 'Austin', state: 'TX' }, details: { beds: 3 }, music },
      brand: { agentName: 'Test Agent', brokerage: 'Test Realty', phone: '555-0100' },
      clipsById: byName,
      settings,
      workDir: path.join(dir, 'render'),
      cacheDir: path.join(dir, 'cache'),
      outFile: out,
    });
    const info = JSON.parse(await runFFprobe(['-print_format', 'json', '-show_streams', '-show_format', res.file]));
    const v = info.streams.find((s) => s.codec_type === 'video');
    const a = info.streams.find((s) => s.codec_type === 'audio');
    assert.equal(v.width, 1080);
    assert.equal(v.height, 1920);
    assert.equal(v.pix_fmt, 'yuv420p');
    assert.equal(v.color_space, 'bt709');
    assert.ok(a, 'has audio track');
    assert.ok(Math.abs(Number(info.format.duration) - plan.total) < 0.15, `duration ${info.format.duration} vs plan ${plan.total}`);
    await fs.access(res.poster);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
