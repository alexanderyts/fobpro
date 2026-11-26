import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { config, ROOT } from './config.js';
import { Store, newId, DEFAULT_SETTINGS } from './store.js';
import { Jobs } from './jobs.js';
import { STYLES, FORMATS, ROOM_ORDER, ROOM_LABELS } from './media/plan.js';
import { LOOKS, computeGrade } from './media/grade.js';
import { runFFmpeg, checkFFmpeg } from './media/ffmpeg.js';
import { setCurveInterp } from './media/grade.js';
import { toSdr, toRgb, chain } from './media/filters.js';
import { probeAudio } from './media/probe.js';
import { classifierStatus, ISSUES } from './classify.js';

const store = new Store(config.dataDir).load();
const engine = await checkFFmpeg();
if (!engine.pchip) setCurveInterp(null);
const jobs = new Jobs(store);
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.mts', '.m2ts', '.mxf', '.avi', '.mkv', '.webm', '.3gp']);
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.wav', '.aif', '.aiff', '.flac', '.ogg']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function loadProject(req, res, next) {
  const project = store.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  req.project = project;
  next();
}

/** Never send server file-system paths to the browser. */
const publicClip = ({ file, ...c }) => c;
const publicMusic = (m) => (m ? (({ file, ...rest }) => rest)(m) : null);
const publicProject = (p) => ({ ...p, clips: p.clips.map(publicClip), music: publicMusic(p.music) });

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));

// ---------- Meta ----------
app.get('/api/meta', (req, res) => {
  res.json({
    styles: STYLES,
    formats: FORMATS,
    looks: LOOKS,
    rooms: ROOM_ORDER.map((id) => ({ id, label: ROOM_LABELS[id] })),
    issues: ISSUES,
    classifier: classifierStatus(),
    engine,
    defaults: DEFAULT_SETTINGS,
  });
});

// ---------- Projects ----------
app.get('/api/projects', (req, res) => {
  res.json(
    store.listProjects().map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      details: p.details,
      clipCount: p.clips.length,
      readyCount: p.clips.filter((c) => c.status === 'ready').length,
      poster: p.deliverables.find((d) => d.status === 'done')?.poster || p.clips.find((c) => c.assets?.poster)?.assets.poster || null,
      deliverables: p.deliverables.map((d) => pick(d, ['id', 'status', 'formatId', 'progress'])),
      updatedAt: p.updatedAt,
      createdAt: p.createdAt,
    })),
  );
});

app.post('/api/projects', (req, res) => {
  const body = req.body || {};
  const project = store.createProject({
    address: pick(body.address, ['line1', 'city', 'state', 'zip']),
    details: pick(body.details, ['price', 'beds', 'baths', 'sqft']),
    label: body.label,
  });
  res.status(201).json(publicProject(project));
});

app.get('/api/projects/:id', loadProject, (req, res) => res.json(publicProject(req.project)));

app.patch('/api/projects/:id', loadProject, (req, res) => {
  const p = req.project;
  const b = req.body || {};
  if (b.address) {
    Object.assign(p.address, pick(b.address, ['line1', 'city', 'state', 'zip']));
    p.name = p.address.line1 || p.name;
  }
  if (b.details) Object.assign(p.details, pick(b.details, ['price', 'beds', 'baths', 'sqft']));
  if (typeof b.label === 'string') p.label = b.label.slice(0, 40);
  if (b.settings) {
    const s = pick(b.settings, ['style', 'targetDuration', 'fps', 'resolution', 'slowmo', 'stabilize', 'look', 'gradeStrength', 'formats']);
    if (s.style && !STYLES[s.style]) delete s.style;
    if (s.look && !LOOKS[s.look]) delete s.look;
    if (s.fps && ![24, 25, 30].includes(Number(s.fps))) delete s.fps;
    if (s.resolution && ![1080, 2160].includes(Number(s.resolution))) delete s.resolution;
    if (s.formats) s.formats = s.formats.filter((f) => FORMATS[f]);
    if (s.gradeStrength !== undefined) s.gradeStrength = Math.max(0, Math.min(1, Number(s.gradeStrength)));
    if (s.targetDuration !== undefined) s.targetDuration = Math.max(0, Math.min(600, Number(s.targetDuration) || 0));
    Object.assign(p.settings, s);
  }
  store.touch(p);
  res.json(publicProject(p));
});

app.delete('/api/projects/:id', loadProject, wrap(async (req, res) => {
  for (const c of req.project.clips) jobs.cancel(c.id);
  for (const d of req.project.deliverables) jobs.cancel(d.id);
  store.deleteProject(req.project.id);
  await fsp.rm(store.projectDir(req.project.id), { recursive: true, force: true });
  res.status(204).end();
}));

// ---------- Clips ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(store.projectDir(req.params.id), 'source');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const id = newId('clp');
      file.clipId = id;
      cb(null, `${id}${path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (req, file, cb) => cb(null, VIDEO_EXT.has(path.extname(file.originalname).toLowerCase())),
});

app.post('/api/projects/:id/clips', loadProject, upload.array('files', 200), (req, res) => {
  const p = req.project;
  const added = [];
  for (const f of req.files || []) {
    const clip = {
      id: f.clipId,
      file: f.path,
      originalName: f.originalname,
      sizeBytes: f.size,
      status: 'queued',
      include: true,
      room: null,
      roomSource: null,
      addedAt: new Date().toISOString(),
    };
    p.clips.push(clip);
    added.push(clip);
    jobs.enqueueAnalysis(p.id, clip.id);
  }
  store.touch(p);
  res.status(201).json({ added: added.map((c) => c.id) });
});

app.patch('/api/projects/:id/clips/:clipId', loadProject, (req, res) => {
  const clip = req.project.clips.find((c) => c.id === req.params.clipId);
  if (!clip) return res.status(404).json({ error: 'Clip not found' });
  const b = req.body || {};
  if (typeof b.include === 'boolean') clip.include = b.include;
  if (b.room !== undefined && (b.room === null || ROOM_ORDER.includes(b.room))) {
    clip.room = b.room;
    clip.roomSource = 'manual';
  }
  for (const k of ['trimIn', 'trimOut']) {
    if (b[k] === null) delete clip[k];
    else if (b[k] !== undefined && clip.meta) clip[k] = Math.max(0, Math.min(clip.meta.duration, Number(b[k])));
  }
  if (clip.trimIn !== undefined && clip.trimOut !== undefined && clip.trimOut - clip.trimIn < 0.5) {
    clip.trimOut = Math.min(clip.meta.duration, clip.trimIn + 0.5);
  }
  if (b.stabilize !== undefined) clip.stabilize = b.stabilize === null ? undefined : Boolean(b.stabilize);
  if (b.gradeStrength !== undefined) clip.gradeStrength = b.gradeStrength === null ? undefined : Math.max(0, Math.min(1, Number(b.gradeStrength)));
  if (b.room !== undefined && !req.project.manualOrder) jobs.applyAutoOrder(req.project);
  store.touch(req.project);
  res.json(publicClip(clip));
});

app.delete('/api/projects/:id/clips/:clipId', loadProject, wrap(async (req, res) => {
  const p = req.project;
  const clip = p.clips.find((c) => c.id === req.params.clipId);
  if (!clip) return res.status(404).json({ error: 'Clip not found' });
  jobs.cancel(clip.id);
  p.clips = p.clips.filter((c) => c.id !== clip.id);
  store.touch(p);
  await fsp.rm(clip.file, { force: true });
  await fsp.rm(path.join(store.projectDir(p.id), 'analysis', clip.id), { recursive: true, force: true });
  res.status(204).end();
}));

app.post('/api/projects/:id/clips/:clipId/retry', loadProject, (req, res) => {
  const clip = req.project.clips.find((c) => c.id === req.params.clipId);
  if (!clip) return res.status(404).json({ error: 'Clip not found' });
  clip.status = 'queued';
  clip.error = null;
  store.touch(req.project);
  jobs.enqueueAnalysis(req.project.id, clip.id);
  res.json(publicClip(clip));
});

app.post('/api/projects/:id/order', loadProject, (req, res) => {
  const p = req.project;
  if (req.body?.auto) {
    p.manualOrder = false;
    jobs.applyAutoOrder(p);
  } else if (Array.isArray(req.body?.order)) {
    const order = req.body.order;
    p.clips.sort((a, b) => {
      const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
      return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
    });
    p.manualOrder = true;
  }
  store.touch(p);
  res.json({ order: p.clips.map((c) => c.id), manualOrder: Boolean(p.manualOrder) });
});

/** Before/after still for the inspector, using the same grade as the render. */
app.get('/api/projects/:id/clips/:clipId/frame.jpg', loadProject, wrap(async (req, res) => {
  const p = req.project;
  const clip = p.clips.find((c) => c.id === req.params.clipId);
  if (!clip?.analysis) return res.status(404).end();
  const graded = req.query.graded !== '0';
  const t = Number(req.query.t ?? (clip.analysis.trimIn + clip.analysis.trimOut) / 2);
  const grade = computeGrade(clip.analysis.color, {
    look: p.settings.look,
    strength: clip.gradeStrength ?? p.settings.gradeStrength,
  });
  const key = crypto.createHash('sha1').update(JSON.stringify([t, graded, graded && grade.filters])).digest('hex').slice(0, 16);
  const out = path.join(store.projectDir(p.id), 'analysis', clip.id, `frame-${key}.jpg`);
  if (!fs.existsSync(out)) {
    const sdr = toSdr(clip.meta);
    const vf = chain(sdr, toRgb(sdr ? { ...clip.meta, hdr: 'tm' } : clip.meta), ...(graded ? grade.filters : []),
      'scale=960:-2:flags=lanczos:out_color_matrix=bt709', 'format=yuvj420p');
    await runFFmpeg(['-ss', String(Math.max(0, t)), '-i', clip.file, '-frames:v', '1', '-q:v', '3', '-vf', vf, out]);
  }
  res.set('Cache-Control', 'private, max-age=3600').sendFile(out);
}));

// ---------- Music ----------
const musicUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(store.projectDir(req.params.id), 'music');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${newId('mus')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, AUDIO_EXT.has(path.extname(file.originalname).toLowerCase())),
});

app.post('/api/projects/:id/music', loadProject, musicUpload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Upload an audio file (MP3, M4A, WAV, AIFF, FLAC).' });
  const p = req.project;
  const old = p.music?.file;
  let info;
  try {
    info = await probeAudio(req.file.path);
  } catch {
    await fsp.rm(req.file.path, { force: true });
    return res.status(400).json({ error: 'Could not read that audio file.' });
  }
  p.music = {
    file: req.file.path,
    name: req.file.originalname,
    url: `/files/projects/${p.id}/music/${path.basename(req.file.path)}`,
    duration: info.duration,
    status: 'analyzing',
  };
  store.touch(p);
  jobs.enqueueMusic(p.id);
  if (old && old !== req.file.path) await fsp.rm(old, { force: true });
  res.status(201).json(publicMusic(p.music));
}));

app.delete('/api/projects/:id/music', loadProject, wrap(async (req, res) => {
  const p = req.project;
  if (p.music?.file) await fsp.rm(p.music.file, { force: true });
  p.music = null;
  store.touch(p);
  res.status(204).end();
}));

// ---------- Plan & render ----------
app.get('/api/projects/:id/plan', loadProject, (req, res) => {
  const formatId = FORMATS[req.query.format] ? req.query.format : 'film-branded';
  const plan = jobs.plan(req.project, formatId);
  res.json(plan);
});

app.post('/api/projects/:id/render', loadProject, (req, res) => {
  const p = req.project;
  const formats = (req.body?.formats || p.settings.formats || []).filter((f) => FORMATS[f]);
  if (!formats.length) return res.status(400).json({ error: 'Choose at least one deliverable.' });
  if (p.clips.some((c) => c.status === 'queued' || c.status === 'analyzing')) {
    return res.status(409).json({ error: 'Footage is still being analysed.' });
  }
  try {
    const created = formats.map((f) => jobs.enqueueRender(p.id, f));
    res.status(202).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/projects/:id/deliverables/:did/cancel', loadProject, (req, res) => {
  jobs.cancelRender(req.project, req.params.did);
  res.json({ ok: true });
});

app.delete('/api/projects/:id/deliverables/:did', loadProject, wrap(async (req, res) => {
  const p = req.project;
  const d = p.deliverables.find((x) => x.id === req.params.did);
  if (!d) return res.status(404).end();
  jobs.cancel(d.id);
  p.deliverables = p.deliverables.filter((x) => x.id !== d.id);
  store.touch(p);
  if (d.file) {
    const f = path.join(store.projectDir(p.id), 'renders', path.basename(d.file));
    await fsp.rm(f, { force: true });
    await fsp.rm(f.replace(/\.mp4$/, '.jpg'), { force: true });
  }
  res.status(204).end();
}));

app.get('/download/:id/:did', loadProject, (req, res) => {
  const d = req.project.deliverables.find((x) => x.id === req.params.did);
  if (!d?.file) return res.status(404).end();
  const f = path.join(store.projectDir(req.project.id), 'renders', path.basename(d.file));
  const name = path.basename(f).replace(/_[a-z0-9]{6}\.mp4$/, '.mp4');
  res.download(f, name);
});

// ---------- Brand kit ----------
app.get('/api/brand', (req, res) => {
  const b = store.getBrand();
  res.json({ ...b, logoPath: undefined, logoUrl: b.logoPath ? `/files/brand/${path.basename(b.logoPath)}?v=${b.logoVersion || 0}` : null });
});

app.put('/api/brand', (req, res) => {
  const patch = pick(req.body || {}, ['agentName', 'agentTitle', 'brokerage', 'phone', 'email', 'website', 'accentColor']);
  for (const k of Object.keys(patch)) patch[k] = String(patch[k]).slice(0, 120);
  if (patch.accentColor && !/^#[0-9a-f]{6}$/i.test(patch.accentColor)) delete patch.accentColor;
  store.setBrand(patch);
  res.json({ ok: true });
});

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(config.dataDir, 'brand');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `logo${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, IMAGE_EXT.has(path.extname(file.originalname).toLowerCase())),
});

app.post('/api/brand/logo', logoUpload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Upload a PNG, JPG or WebP logo.' });
  const prev = store.getBrand().logoPath;
  if (prev && prev !== req.file.path) await fsp.rm(prev, { force: true });
  store.setBrand({ logoPath: req.file.path, logoVersion: Date.now() });
  res.status(201).json({ ok: true });
}));

app.delete('/api/brand/logo', wrap(async (req, res) => {
  const prev = store.getBrand().logoPath;
  if (prev) await fsp.rm(prev, { force: true });
  store.setBrand({ logoPath: null });
  res.status(204).end();
}));

// ---------- Live updates (Server-Sent Events) ----------
const clients = new Set();
app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
});
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(msg);
}
store.on('project', (p) => broadcast('project', publicProject(p)));
store.on('deleted', (id) => broadcast('deleted', { id }));
jobs.on('progress', (e) => broadcast('progress', e));

// ---------- Static ----------
app.use('/files/projects', express.static(path.join(config.dataDir, 'projects'), { dotfiles: 'deny', index: false }));
app.use('/files/brand', express.static(path.join(config.dataDir, 'brand'), { dotfiles: 'deny', index: false }));
app.use(express.static(path.join(ROOT, 'web'), { index: 'index.html', extensions: ['html'] }));
app.get(/^\/(?!api|files|download).*/, (req, res) => res.sendFile(path.join(ROOT, 'web', 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 500;
  res.status(status).json({ error: status === 413 ? 'File is too large.' : 'Something went wrong on the server.' });
});

jobs.recover();
app.listen(config.port, config.host, () => {
  const cls = classifierStatus();
  console.log(`Listing Studio running at http://${config.host}:${config.port}`);
  console.log(`  data: ${config.dataDir}`);
  console.log(`  ffmpeg: ${engine.version}${engine.ok ? '' : ` — MISSING: ${engine.missing.join(', ')}`}`);
  console.log(`  room labelling: ${cls.enabled ? `on (${cls.model})` : `off — ${cls.reason}`}`);
});
