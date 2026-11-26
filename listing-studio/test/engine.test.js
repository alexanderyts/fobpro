// Unit tests for the pure parts of the engine (no ffmpeg needed except beats).
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { computeGrade } from '../server/media/grade.js';
import { buildPlan, autoOrder } from '../server/media/plan.js';
import { findSteadyRange } from '../server/media/analyze.js';
import { analyzeMusic } from '../server/media/beats.js';
import { makeMusic } from './make-fixtures.js';

const neutral = { p005: 0.02, p50: 0.5, p995: 0.98, rMid: 0.8, gMid: 0.8, bMid: 0.8, neutralCoverage: 0.2 };

test('grade: warm cast is pulled back toward neutral', () => {
  const g = computeGrade({ ...neutral, rMid: 0.86, bMid: 0.66 }, { strength: 1 });
  assert.ok(g.params.gainR < 1, 'red reduced');
  assert.ok(g.params.gainB > 1, 'blue boosted');
  assert.match(g.filters[0], /^colorchannelmixer=/);
});

test('grade: dark footage is lifted, bright footage is not darkened', () => {
  const dark = computeGrade({ ...neutral, p50: 0.3, p995: 0.8 }, { strength: 1 });
  const darkMid = dark.params.curve.find(([x]) => Math.abs(x - 0.3) < 1e-6);
  assert.ok(darkMid[1] > 0.4, `median lifted (got ${darkMid[1]})`);

  const bright = computeGrade({ ...neutral, p50: 0.88, p005: 0.2 }, { strength: 1 });
  const brightMid = bright.params.curve.find(([x]) => Math.abs(x - 0.88) < 1e-6);
  assert.ok(brightMid[1] >= 0.86 - 1e-9, `median not pulled down (got ${brightMid[1]})`);
});

test('grade: zero strength is a no-op curve', () => {
  const g = computeGrade({ ...neutral, rMid: 0.9, p50: 0.2 }, { strength: 0, look: 'natural' });
  assert.equal(g.filters.some((f) => f.startsWith('colorchannelmixer')), false);
  for (const [x, y] of g.params.curve) assert.ok(Math.abs(x - y) < 1e-6);
});

test('grade: curve points are strictly increasing', () => {
  for (const look of ['natural', 'bright', 'warm', 'crisp']) {
    const g = computeGrade({ ...neutral, p005: 0.1, p50: 0.12, p995: 0.75 }, { look, strength: 1 });
    for (let i = 1; i < g.params.curve.length; i++) assert.ok(g.params.curve[i][0] > g.params.curve[i - 1][0]);
  }
});

test('analysis: shaky head and tail are trimmed', () => {
  const fps = 30;
  const energy = Array.from({ length: 240 }, (_, i) => (i < 30 || i > 220 ? 0.02 : 0.0008));
  const r = findSteadyRange({ energy, fps }, { duration: 8 });
  assert.ok(r.in >= 0.95 && r.in <= 1.2, `in ${r.in}`);
  assert.ok(r.out >= 7.2 && r.out <= 7.4, `out ${r.out}`);
});

function fakeClip(id, room, { dur = 8, fps = 30, created } = {}) {
  return {
    id,
    room,
    status: 'ready',
    include: true,
    originalName: `${id}.MOV`,
    meta: { duration: dur, fps, creationTime: created || `2026-01-01T10:00:${id.padStart(2, '0')}Z` },
    analysis: { trimIn: 0.5, trimOut: dur - 0.5, shake: 0.001, motion: { envelope: [], envelopeRate: 10 } },
  };
}

test('order: tour sequence, closing aerial', () => {
  const clips = [fakeClip('1', 'kitchen'), fakeClip('2', 'aerial'), fakeClip('3', 'exterior'), fakeClip('4', 'aerial'), fakeClip('5', 'living')];
  assert.deepEqual(autoOrder(clips), ['2', '3', '5', '1', '4']);
});

test('plan: cuts land on the beat', () => {
  const clips = ['aerial', 'exterior', 'living', 'kitchen', 'dining', 'bedroom'].map((r, i) => fakeClip(String(i + 1), r));
  const beats = Array.from({ length: 200 }, (_, i) => i * 0.5);
  const plan = buildPlan({
    clips,
    music: { file: 'x.m4a', analysis: { beats, downbeats: beats.filter((_, i) => i % 4 === 0) } },
    settings: { style: 'walkthrough', fps: 30, targetDuration: 0, slowmo: true },
    formatId: 'film-branded',
  });
  assert.equal(plan.music.beatSynced, true);
  for (const s of plan.segments.slice(1)) {
    const mid = s.start + s.transitionIn.duration / 2;
    const off = Math.abs(mid - Math.round(mid / 0.5) * 0.5);
    assert.ok(off <= 1 / 30 + 1e-6, `cut at ${mid.toFixed(3)} is ${off.toFixed(3)} s off the beat`);
  }
  assert.ok(plan.outro, 'branded film has an agent card');
});

test('plan: social formats respect max runtime and drop surplus clips', () => {
  const clips = Array.from({ length: 40 }, (_, i) => fakeClip(String(i + 1), i % 2 ? 'bedroom' : 'living'));
  const plan = buildPlan({ clips, music: null, settings: { style: 'walkthrough', fps: 30, targetDuration: 60 }, formatId: 'reel' });
  assert.ok(plan.total <= 30 + 1e-6, `total ${plan.total}`);
  assert.ok(plan.dropped.length > 0);
});

test('plan: MLS cut has no agent card; 60 fps clips become slow motion', () => {
  const clips = [fakeClip('1', 'exterior', { fps: 59.94 }), fakeClip('2', 'living')];
  const plan = buildPlan({ clips, music: null, settings: { style: 'walkthrough', fps: 30, slowmo: true }, formatId: 'film-mls' });
  assert.equal(plan.outro, null);
  assert.ok(Math.abs(plan.segments[0].speed - 30 / 59.94) < 1e-3);
});

test('beats: recovers tempo and beat positions of a 120 BPM track', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ls-beats-'));
  try {
    const file = await makeMusic(dir, { bpm: 120, dur: 30 });
    const r = await analyzeMusic(file);
    assert.ok(Math.abs(r.bpm - 120) < 1, `bpm ${r.bpm}`);
    const errs = r.beats.map((b) => Math.abs(b - Math.round(b / 0.5) * 0.5)).sort((a, b) => a - b);
    assert.ok(errs[errs.length >> 1] < 0.03, `median beat error ${errs[errs.length >> 1]}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
