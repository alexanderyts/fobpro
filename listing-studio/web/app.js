import { api, $, $$, html } from './lib.js';
import { renderListings } from './views/listings.js';
import { mountProject, projectUpdated, projectProgress } from './views/project.js';
import { renderBrand } from './views/brand.js';

export const state = {
  meta: null,
  projects: [],
  project: null,
  route: { name: 'listings' },
};

const app = document.getElementById('app');

function parseRoute() {
  const h = location.hash.replace(/^#/, '') || '/';
  const m = h.match(/^\/p\/([\w-]+)/);
  if (m) return { name: 'project', id: m[1] };
  if (h.startsWith('/brand')) return { name: 'brand' };
  return { name: 'listings' };
}

async function route() {
  state.route = parseRoute();
  $$('[data-nav]').forEach((a) =>
    a.classList.toggle('active', a.dataset.nav === state.route.name || (state.route.name === 'project' && a.dataset.nav === 'listings')),
  );
  document.getElementById('modal-root').innerHTML = '';
  try {
    if (state.route.name === 'project') {
      state.project = await api(`/api/projects/${state.route.id}`);
      document.title = `${state.project.name} — Threshold`;
      mountProject(app, state);
    } else if (state.route.name === 'brand') {
      state.project = null;
      document.title = 'Brand kit — Threshold';
      await renderBrand(app, state);
    } else {
      state.project = null;
      document.title = 'Listings — Threshold';
      state.projects = await api('/api/projects');
      renderListings(app, state);
    }
  } catch (err) {
    app.innerHTML = html`<div class="page"><div class="empty"><h2>Not found</h2><p>${err.message}</p><a class="btn" href="#/">Back to listings</a></div></div>`.s;
  }
  renderEngine();
  app.focus({ preventScroll: true });
}

export function renderEngine() {
  const el = document.getElementById('engine-status');
  const p = state.project;
  let rendering = 0, analysing = 0;
  if (p) {
    rendering = p.deliverables.filter((d) => d.status === 'rendering' || d.status === 'queued').length;
    analysing = p.clips.filter((c) => c.status === 'analyzing' || c.status === 'queued').length;
  } else {
    for (const x of state.projects) rendering += x.deliverables.filter((d) => d.status === 'rendering' || d.status === 'queued').length;
  }
  const busy = rendering || analysing;
  const parts = [];
  if (rendering) parts.push(`Rendering ${rendering}`);
  if (analysing) parts.push(`Analysing ${analysing}`);
  const cls = state.meta?.classifier;
  const eng = state.meta?.engine;
  if (eng && !eng.ok) {
    el.innerHTML = html`<span style="color:var(--err)" title="Install FFmpeg with libvidstab, zimg and freetype">FFmpeg unavailable or incomplete: ${eng.missing.join(', ')}</span>`.s;
    return;
  }
  el.innerHTML = html`
    <span title="${cls?.enabled ? `Rooms are labelled automatically (${cls.model})` : cls?.reason || ''}">
      Room labels: ${cls?.enabled ? 'automatic' : 'manual'}
    </span>
    <span><i class="dot ${busy ? 'busy' : 'on'}"></i>${busy ? parts.join(' · ') : 'Engine idle'}</span>`.s;
}

// ---------- Live updates ----------
function connectEvents() {
  const es = new EventSource('/api/events');
  es.addEventListener('project', (e) => {
    const p = JSON.parse(e.data);
    if (state.route.name === 'project' && state.project?.id === p.id) {
      state.project = p;
      projectUpdated(state);
    } else if (state.route.name === 'listings') {
      const i = state.projects.findIndex((x) => x.id === p.id);
      if (i >= 0) {
        api('/api/projects').then((list) => {
          state.projects = list;
          if (state.route.name === 'listings') renderListings(app, state);
        });
      }
    }
    renderEngine();
  });
  es.addEventListener('progress', (e) => {
    const ev = JSON.parse(e.data);
    if (state.project?.id === ev.projectId) projectProgress(ev);
  });
  es.addEventListener('deleted', (e) => {
    const { id } = JSON.parse(e.data);
    if (state.project?.id === id) location.hash = '#/';
  });
}

(async function boot() {
  state.meta = await api('/api/meta');
  window.addEventListener('hashchange', route);
  connectEvents();
  route();
})();
