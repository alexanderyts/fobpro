// Small UI toolkit: escaped templates, API client, formatting, modal, toast, icons.

export class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(s);

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function part(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  return esc(String(v));
}
/** Tagged template: interpolations are escaped unless wrapped in raw()/html``. */
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += part(vals[i]);
  });
  return new Raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- API ----------
export async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** Multipart upload with progress (fetch has no upload progress). */
export function upload(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total, e.loaded, e.total);
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed — check your connection.'));
    xhr.send(form);
  });
}

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

// ---------- Formatting ----------
export function runtime(sec) {
  if (!Number.isFinite(sec)) return '—';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function timecode(sec) {
  if (!Number.isFinite(sec)) return '--:--.-';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}
export function bytes(n) {
  if (!n) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
export function ago(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
export function money(v) {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  return n ? `$${n.toLocaleString('en-US')}` : '';
}
export function facts(d = {}) {
  const parts = [];
  if (d.beds) parts.push(`${d.beds} bd`);
  if (d.baths) parts.push(`${d.baths} ba`);
  if (d.sqft) parts.push(`${Number(String(d.sqft).replace(/[^0-9.]/g, '')).toLocaleString('en-US')} sq ft`);
  if (d.price) parts.push(money(d.price));
  return parts;
}
export function cityLine(a = {}) {
  return [a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

// ---------- Toast ----------
export function toast(msg, { error = false, ms = 3800 } = {}) {
  const el = document.createElement('div');
  el.className = `toast${error ? ' err' : ''}`;
  el.textContent = msg;
  document.getElementById('toast-root').append(el);
  setTimeout(() => el.remove(), ms);
}

// ---------- Modal ----------
export function openModal(content, { wide = false, onClose } = {}) {
  const root = document.getElementById('modal-root');
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${content}</div>`;
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  back.addEventListener('mousedown', (e) => e.target === back && close());
  back.addEventListener('click', (e) => e.target.closest('[data-close]') && close());
  document.addEventListener('keydown', onKey);
  root.append(back);
  back.querySelector('input, select, button:not([data-close])')?.focus();
  return { el: back.firstElementChild, close };
}

// ---------- Icons (1.5px line, 16 grid) ----------
const svg = (d, extra = '') =>
  raw(`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`);
export const icon = {
  upload: svg('<path d="M8 10.5V2.5M4.8 5.6 8 2.5l3.2 3.1M2.5 10v3h11v-3"/>'),
  download: svg('<path d="M8 2.5v8M4.8 7.4 8 10.5l3.2-3.1M2.5 10v3h11v-3"/>'),
  plus: svg('<path d="M8 3v10M3 8h10"/>'),
  trash: svg('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>'),
  grip: svg('<path d="M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01" stroke-width="2.2"/>'),
  music: svg('<path d="M6 12V3.5l7-1.5V10.5"/><circle cx="4.5" cy="12" r="1.5"/><circle cx="11.5" cy="10.5" r="1.5"/>'),
  play: svg('<path d="M5 3.5v9l7-4.5z"/>'),
  close: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
  back: svg('<path d="M10 3.5 5.5 8l4.5 4.5"/>'),
  film: svg('<rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M5 3v10M11 3v10M2.5 6h2.5M2.5 10h2.5M11 6h2.5M11 10h2.5"/>'),
  retry: svg('<path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3"/>'),
  sort: svg('<path d="M4.5 3v10M2.5 11l2 2 2-2M11.5 13V3M9.5 5l2-2 2 2"/>'),
};
