// Background work: clip analysis (parallel) and renders (one at a time).

import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { config } from './config.js';
import { probe } from './media/probe.js';
import { analyzeClip } from './media/analyze.js';
import { analyzeMusic } from './media/beats.js';
import { buildPlan, autoOrder, FORMATS } from './media/plan.js';
import { renderDeliverable } from './media/render.js';
import { classifyClip, heuristicRoom } from './classify.js';

class Lane {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }
  push(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.next();
    });
  }
  next() {
    while (this.running < this.concurrency && this.queue.length) {
      const { task, resolve, reject } = this.queue.shift();
      this.running++;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          this.running--;
          this.next();
        });
    }
  }
}

export class Jobs extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.analysisLane = new Lane(config.analysisConcurrency);
    this.renderLane = new Lane(1);
    this.controllers = new Map();
    this.lastEmit = new Map();
  }

  /** Throttled progress events (UI only; not persisted on every tick). */
  progress(projectId, kind, id, value, extra = {}) {
    const key = `${kind}:${id}`;
    const now = Date.now();
    if (value < 1 && now - (this.lastEmit.get(key) || 0) < 200) return;
    this.lastEmit.set(key, now);
    this.emit('progress', { projectId, kind, id, progress: Number(value.toFixed(3)), ...extra });
  }

  /** On boot: requeue interrupted analysis, fail interrupted renders. */
  recover() {
    for (const project of this.store.listProjects()) {
      let changed = false;
      for (const clip of project.clips) {
        if (clip.status === 'analyzing' || clip.status === 'queued') {
          clip.status = 'queued';
          this.enqueueAnalysis(project.id, clip.id);
          changed = true;
        }
      }
      for (const d of project.deliverables) {
        if (d.status === 'rendering' || d.status === 'queued') {
          d.status = 'error';
          d.error = 'Interrupted — the server restarted during this render.';
          changed = true;
        }
      }
      if (project.music && project.music.status === 'analyzing') {
        this.enqueueMusic(project.id);
      }
      if (changed) this.store.touch(project);
    }
  }

  enqueueAnalysis(projectId, clipId) {
    this.analysisLane.push(() => this.runAnalysis(projectId, clipId)).catch((e) => console.error(e));
  }

  async runAnalysis(projectId, clipId) {
    const project = this.store.getProject(projectId);
    const clip = project?.clips.find((c) => c.id === clipId);
    if (!clip) return;
    clip.status = 'analyzing';
    clip.error = null;
    this.store.touch(project);
    const workDir = path.join(this.store.projectDir(projectId), 'analysis', clip.id);
    const ac = new AbortController();
    this.controllers.set(clip.id, ac);
    try {
      clip.meta = await probe(clip.file, clip.originalName);
      this.store.touch(project);
      clip.analysis = await analyzeClip({
        file: clip.file,
        meta: clip.meta,
        workDir,
        signal: ac.signal,
        onProgress: (p) => this.progress(projectId, 'clip', clip.id, p * 0.9),
      });
      clip.assets = {
        proxy: this.url(projectId, 'analysis', clip.id, 'proxy.mp4'),
        poster: this.url(projectId, 'analysis', clip.id, 'poster.jpg'),
        strip: this.url(projectId, 'analysis', clip.id, 'strip.jpg'),
      };
      if (!clip.roomSource || clip.roomSource === 'auto') {
        const guess = heuristicRoom(clip);
        if (guess) {
          clip.room = guess;
          clip.roomSource = 'auto';
        }
      }
      if (clip.roomSource !== 'manual') {
        const ai = await classifyClip({
          posterPath: path.join(workDir, 'poster.jpg'),
          stripPath: path.join(workDir, 'strip.jpg'),
          signal: ac.signal,
        });
        if (ai) {
          // Metadata says drone: trust it over a vision guess.
          clip.room = clip.meta.isDrone ? 'aerial' : ai.room;
          clip.roomSource = 'ai';
          clip.roomConfidence = ai.confidence;
          clip.caption = ai.caption;
          clip.issues = ai.issues;
        }
      }
      clip.status = 'ready';
      this.progress(projectId, 'clip', clip.id, 1);
    } catch (err) {
      if (!this.store.getProject(projectId)) return; // project deleted mid-analysis
      clip.status = 'error';
      clip.error = friendlyError(err);
      console.error(`[analysis] ${clip.originalName}:`, err.message);
    } finally {
      this.controllers.delete(clip.id);
    }
    // Keep tour order fresh until the user drags something by hand.
    if (!project.manualOrder) this.applyAutoOrder(project);
    this.store.touch(project);
  }

  applyAutoOrder(project) {
    const order = autoOrder(project.clips);
    project.clips.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }

  enqueueMusic(projectId) {
    this.analysisLane.push(async () => {
      const project = this.store.getProject(projectId);
      if (!project?.music) return;
      try {
        project.music.analysis = await analyzeMusic(project.music.file);
        project.music.status = 'ready';
      } catch (err) {
        project.music.status = 'error';
        project.music.error = friendlyError(err);
      }
      this.store.touch(project);
    }).catch((e) => console.error(e));
  }

  cancel(id) {
    this.controllers.get(id)?.abort();
  }

  url(projectId, ...parts) {
    return `/files/projects/${projectId}/${parts.join('/')}`;
  }

  plan(project, formatId) {
    const music = project.music?.status === 'ready' ? project.music : null;
    return buildPlan({ clips: project.clips, music, settings: project.settings, formatId });
  }

  enqueueRender(projectId, formatId) {
    const project = this.store.getProject(projectId);
    const format = FORMATS[formatId];
    const plan = this.plan(project, formatId);
    if (plan.error) throw new Error(plan.error);
    const id = `dlv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const deliverable = {
      id,
      formatId,
      label: format.label,
      sub: format.sub,
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      plan: summarizePlan(plan),
    };
    project.deliverables.unshift(deliverable);
    this.store.touch(project);
    this.renderLane.push(() => this.runRender(projectId, id)).catch((e) => console.error(e));
    return deliverable;
  }

  async runRender(projectId, deliverableId) {
    const project = this.store.getProject(projectId);
    const d = project?.deliverables.find((x) => x.id === deliverableId);
    if (!d || d.status !== 'queued') return;
    // Re-plan at render time so edits made while queued are honoured.
    const plan = this.plan(project, d.formatId);
    if (plan.error) {
      d.status = 'error';
      d.error = plan.error;
      this.store.touch(project);
      return;
    }
    d.status = 'rendering';
    d.startedAt = new Date().toISOString();
    d.plan = summarizePlan(plan);
    this.store.touch(project);

    const dir = path.join(this.store.projectDir(projectId), 'renders');
    await fs.mkdir(dir, { recursive: true });
    const base = `${slug(project.name)}_${slug(FORMATS[d.formatId].label)}_${FORMATS[d.formatId].aspect.replace(':', 'x')}${FORMATS[d.formatId].branded ? '' : '_unbranded'}_${d.id.slice(-6)}`;
    const outFile = path.join(dir, `${base}.mp4`);
    const ac = new AbortController();
    this.controllers.set(d.id, ac);
    const brand = this.store.getBrand();
    try {
      const res = await renderDeliverable({
        plan,
        project: { ...project, music: project.music?.status === 'ready' ? project.music : null },
        brand: brand.logoPath ? brand : { ...brand, logoPath: null },
        clipsById: Object.fromEntries(project.clips.map((c) => [c.id, c])),
        settings: project.settings,
        workDir: path.join(this.store.projectDir(projectId), 'work', d.id),
        cacheDir: path.join(config.dataDir, 'cache'),
        outFile,
        signal: ac.signal,
        onProgress: (p) => {
          d.progress = p;
          this.progress(projectId, 'deliverable', d.id, p);
        },
      });
      const stat = await fs.stat(res.file);
      Object.assign(d, {
        status: 'done',
        progress: 1,
        duration: res.duration,
        sizeBytes: stat.size,
        width: plan.format.width,
        height: plan.format.height,
        file: this.url(projectId, 'renders', path.basename(res.file)),
        poster: this.url(projectId, 'renders', path.basename(res.poster)),
        finishedAt: new Date().toISOString(),
      });
      await fs.rm(path.join(this.store.projectDir(projectId), 'work', d.id), { recursive: true, force: true });
    } catch (err) {
      d.status = ac.signal.aborted ? 'cancelled' : 'error';
      d.error = ac.signal.aborted ? null : friendlyError(err);
      if (!ac.signal.aborted) console.error('[render]', err.message);
    } finally {
      this.controllers.delete(d.id);
    }
    if (this.store.getProject(projectId)) this.store.touch(project);
  }

  cancelRender(project, deliverableId) {
    const d = project.deliverables.find((x) => x.id === deliverableId);
    if (!d) return;
    if (d.status === 'queued') d.status = 'cancelled';
    this.cancel(deliverableId);
    this.store.touch(project);
  }
}

export function summarizePlan(plan) {
  return {
    total: plan.total,
    shots: plan.segments.length,
    style: plan.style.id,
    width: plan.format.width,
    height: plan.format.height,
    bpm: plan.music?.bpm || null,
    beatSynced: Boolean(plan.music?.beatSynced),
    dropped: plan.dropped.length,
  };
}

function slug(s) {
  return String(s || 'listing').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 60) || 'listing';
}

function friendlyError(err) {
  const msg = String(err?.message || err);
  if (/No video stream/i.test(msg)) return 'This file has no video track.';
  if (/Invalid data found|moov atom not found/i.test(msg)) return 'File is incomplete or not a supported video format.';
  if (/Could not start ffmpeg/i.test(msg)) return 'FFmpeg is not installed or not on PATH.';
  return msg.length > 300 ? `${msg.slice(0, 300)}…` : msg;
}
