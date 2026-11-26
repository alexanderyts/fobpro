// Small JSON-file store. Good for a single studio machine; swap for Postgres/SQLite
// behind the same methods when moving to multi-user hosting.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

export const newId = (prefix) => `${prefix}_${crypto.randomBytes(6).toString('hex')}`;

const DEFAULT_SETTINGS = {
  style: 'walkthrough',
  targetDuration: 60,
  fps: 30,
  resolution: 1080,
  slowmo: true,
  stabilize: false,
  look: 'bright',
  gradeStrength: 0.8,
  formats: ['film-branded', 'film-mls', 'reel'],
};

export const DEFAULT_BRAND = {
  agentName: '',
  agentTitle: '',
  brokerage: '',
  phone: '',
  email: '',
  website: '',
  accentColor: '#C9A86A',
  logoPath: null,
};

export class Store extends EventEmitter {
  constructor(dataDir) {
    super();
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'db.json');
    this.db = { projects: {}, brand: { ...DEFAULT_BRAND } };
    this.saving = null;
    this.dirty = false;
  }

  load() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (fs.existsSync(this.file)) {
      this.db = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.db.brand = { ...DEFAULT_BRAND, ...(this.db.brand || {}) };
    }
    return this;
  }

  /** Debounced atomic write (tmp file + rename). */
  save() {
    this.dirty = true;
    if (this.saving) return this.saving;
    this.saving = new Promise((resolve) => {
      setTimeout(async () => {
        while (this.dirty) {
          this.dirty = false;
          const tmp = `${this.file}.tmp`;
          await fsp.writeFile(tmp, JSON.stringify(this.db, null, 1));
          await fsp.rename(tmp, this.file);
        }
        this.saving = null;
        resolve();
      }, 120);
    });
    return this.saving;
  }

  projectDir(id) {
    return path.join(this.dataDir, 'projects', id);
  }

  listProjects() {
    return Object.values(this.db.projects).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getProject(id) {
    return this.db.projects[id] || null;
  }

  createProject(input = {}) {
    const now = new Date().toISOString();
    const id = newId('prj');
    const project = {
      id,
      name: input.address?.line1 || input.name || 'Untitled listing',
      label: input.label || 'Just listed',
      address: { line1: '', city: '', state: '', zip: '', ...(input.address || {}) },
      details: { price: '', beds: '', baths: '', sqft: '', ...(input.details || {}) },
      settings: { ...DEFAULT_SETTINGS, ...(input.settings || {}) },
      clips: [],
      music: null,
      deliverables: [],
      createdAt: now,
      updatedAt: now,
    };
    this.db.projects[id] = project;
    this.touch(project);
    return project;
  }

  /** Mark changed, persist and notify listeners (SSE). */
  touch(project) {
    project.updatedAt = new Date().toISOString();
    this.save();
    this.emit('project', project);
  }

  deleteProject(id) {
    delete this.db.projects[id];
    this.save();
    this.emit('deleted', id);
  }

  getBrand() {
    return this.db.brand;
  }

  setBrand(patch) {
    this.db.brand = { ...this.db.brand, ...patch };
    this.save();
    this.emit('brand', this.db.brand);
    return this.db.brand;
  }
}

export { DEFAULT_SETTINGS };
