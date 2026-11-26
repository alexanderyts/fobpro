import { api, upload, html, raw, $, $$, debounce, runtime, timecode, bytes, facts, cityLine, icon, openModal, toast } from '../lib.js';
import { listingForm, readListingForm } from './listings.js';

const ctx = {
  state: null,
  root: null,
  format: 'film-branded',
  plan: null,
  planSeq: 0,
  abort: null,
  inspector: null,
  dragId: null,
};

const p = () => ctx.state.project;
const meta = () => ctx.state.meta;
const clipById = (id) => p().clips.find((c) => c.id === id);
const busyClip = (c) => c.status === 'queued' || c.status === 'analyzing';

// ------------------------------------------------------------------ mount
export function mountProject(root, state) {
  ctx.abort?.abort();
  ctx.abort = new AbortController();
  ctx.state = state;
  ctx.root = root;
  ctx.plan = null;
  const fmts = p().settings.formats;
  if (!fmts.includes(ctx.format)) ctx.format = fmts[0] || 'film-branded';

  root.innerHTML = html`
    <div class="ws">
      <div class="ws-main">
        <div id="p-head"></div>
        <section class="section">
          <div class="section-head">
            <h2>Footage</h2><span class="note" id="foot-note"></span>
            <div class="right" id="foot-actions"></div>
          </div>
          <div id="upload-status"></div>
          <div id="bin"></div>
        </section>
        <section class="section">
          <div class="section-head">
            <h2>Edit</h2><span class="note">Built from your footage and settings; updates as you change them.</span>
            <div class="right" id="tl-formats"></div>
          </div>
          <div id="timeline"></div>
        </section>
      </div>
      <aside class="ws-side" id="side"></aside>
    </div>
    <div class="drop-overlay" id="drop-overlay"><div>Drop clips to add them</div></div>
    <input type="file" id="file-input" multiple accept="video/*,.mov,.mp4,.m4v,.mts,.mxf,.mkv" hidden>
    <input type="file" id="music-input" accept="audio/*,.mp3,.m4a,.wav,.aif,.aiff,.flac" hidden>`.s;

  renderHead();
  renderBin();
  renderSide();
  refreshPlan();
  bind();
}

export function projectUpdated() {
  renderHead();
  renderBin();
  renderSide();
  refreshPlanSoon();
  if (ctx.inspector) refreshInspector();
}

export function projectProgress(ev) {
  if (ev.kind === 'clip') {
    const el = $(`[data-clip-progress="${ev.id}"]`);
    if (el) {
      el.querySelector('i').style.width = `${Math.round(ev.progress * 100)}%`;
      const lbl = el.parentElement.querySelector('[data-label]');
      if (lbl) lbl.textContent = `Analysing ${Math.round(ev.progress * 100)}%`;
    }
  } else if (ev.kind === 'deliverable') {
    const d = p().deliverables.find((x) => x.id === ev.id);
    if (d) d.progress = ev.progress;
    const el = $(`[data-dlv-progress="${ev.id}"]`);
    if (el) {
      el.querySelector('i').style.width = `${(ev.progress * 100).toFixed(1)}%`;
      const pct = $(`[data-dlv-pct="${ev.id}"]`);
      if (pct) pct.textContent = `${Math.round(ev.progress * 100)}%`;
    }
  }
}

// ------------------------------------------------------------------ header
function renderHead() {
  const pr = p();
  const f = facts(pr.details);
  const ready = pr.clips.filter((c) => c.status === 'ready' && c.include !== false).length;
  const analysing = pr.clips.some(busyClip);
  const n = pr.settings.formats.length;
  $('#p-head').innerHTML = html`
    <div class="crumbs"><a href="#/">Listings</a><span>/</span><span>${pr.name}</span></div>
    <div class="p-head">
      <div>
        <h1>${pr.name}</h1>
        <div class="meta">
          ${cityLine(pr.address) ? html`<span>${cityLine(pr.address)}</span>` : ''}
          ${f.length ? html`<span>${f.join('  ·  ')}</span>` : ''}
          <span class="muted">${pr.label}</span>
        </div>
      </div>
      <div class="actions">
        <button class="btn" data-act="edit-details">Listing details</button>
        <button class="btn primary" data-act="render" ${!ready || analysing || !n ? raw('disabled') : ''}
          title="${analysing ? 'Waiting for footage analysis' : !ready ? 'Add footage first' : ''}">
          ${icon.film} Render ${n} deliverable${n === 1 ? '' : 's'}
        </button>
      </div>
    </div>`.s;
}

// ------------------------------------------------------------------ footage bin
function clipTags(c) {
  const out = [];
  const s = p().settings;
  if (c.status === 'error') return [html`<span class="tag err">${c.error || 'Could not read file'}</span>`];
  if (!c.analysis) return out;
  if (c.include === false) out.push(html`<span class="tag">Excluded</span>`);
  const a = c.analysis;
  const head = (c.trimIn ?? a.trimIn);
  const tail = c.meta.duration - (c.trimOut ?? a.trimOut);
  if (head > 0.35 || tail > 0.35) {
    out.push(html`<span class="tag fix" title="Shaky start/end removed">Trimmed ${head.toFixed(1)} s · ${tail.toFixed(1)} s</span>`);
  }
  if (s.slowmo !== false && c.meta.fps >= 47 && s.fps <= 30) {
    out.push(html`<span class="tag info">${Math.round(c.meta.fps)} fps → ${Math.round((s.fps / c.meta.fps) * 100)}% slow motion</span>`);
  }
  const fl = a.flags || [];
  if (fl.includes('warm-cast') || fl.includes('cool-cast')) out.push(html`<span class="tag fix">White balance corrected</span>`);
  if (fl.includes('underexposed')) out.push(html`<span class="tag fix">Exposure lifted</span>`);
  if (c.meta.hdr) out.push(html`<span class="tag info">HDR → SDR</span>`);
  if (c.meta.orientation === 'portrait') out.push(html`<span class="tag info">Vertical</span>`);
  if (fl.includes('handheld') && !(c.stabilize ?? s.stabilize)) out.push(html`<span class="tag warn">Handheld · consider stabilising</span>`);
  if (c.stabilize ?? s.stabilize) out.push(html`<span class="tag fix">Stabilised</span>`);
  if (fl.includes('blown-highlights')) out.push(html`<span class="tag warn">Clipped highlights</span>`);
  for (const i of c.issues || []) out.push(html`<span class="tag warn">${meta().issues[i] || i}</span>`);
  return out;
}

function roomSelect(c, cls = '') {
  return html`<select class="select sm room-select ${cls}" data-room="${c.id}" aria-label="Room">
    <option value="">Unlabelled</option>
    ${meta().rooms.map((r) => html`<option value="${r.id}" ${c.room === r.id ? raw('selected') : ''}>${r.label}</option>`)}
  </select>`;
}

function roomHint(c) {
  if (c.roomSource === 'ai') return html`<span class="muted" style="font-size:11px" title="Labelled automatically">auto · ${Math.round((c.roomConfidence || 0) * 100)}%</span>`;
  if (c.roomSource === 'auto') return html`<span class="muted" style="font-size:11px" title="From camera metadata or file name">auto</span>`;
  return '';
}

function renderBin() {
  const pr = p();
  const clips = pr.clips;
  const total = clips.reduce((a, c) => a + (c.meta?.duration || 0), 0);
  const unlabelled = clips.filter((c) => c.status === 'ready' && !c.room).length;
  $('#foot-note').innerHTML = clips.length
    ? html`${clips.length} clip${clips.length === 1 ? '' : 's'} · ${runtime(total)} of source${unlabelled
        ? html` · <span style="color:var(--warn)">${unlabelled} unlabelled</span> — set the room to place ${unlabelled === 1 ? 'it' : 'them'} in tour order`
        : ''}`.s
    : '';
  $('#foot-actions').innerHTML = clips.length
    ? html`
      <span class="muted" style="font-size:12px">${pr.manualOrder ? 'Custom order' : 'Tour order'}</span>
      ${pr.manualOrder ? html`<button class="btn sm ghost" data-act="auto-order">${icon.sort} Reset to tour order</button>` : ''}
      <button class="btn sm" data-act="add-footage">${icon.upload} Add footage</button>`.s
    : '';

  const bin = $('#bin');
  if (!clips.length) {
    bin.innerHTML = html`
      <div class="drop">
        <strong>Drop the shoot's video clips here</strong>
        <span>Gimbal walkthroughs, phone clips and drone footage — any order.</span>
        <button class="btn" data-act="add-footage" style="margin-top:6px">${icon.upload} Choose files</button>
        <span class="formats mono">MOV · MP4 · M4V · MTS · MXF — HEVC, H.264, ProRes, 10-bit and HDR</span>
      </div>`.s;
    return;
  }
  const scroll = window.scrollY;
  let n = 0;
  bin.innerHTML = html`<div class="bin">${clips.map((c) => {
    const num = c.include !== false && c.status === 'ready' ? String(++n).padStart(2, '0') : '—';
    const portrait = c.meta?.orientation === 'portrait';
    return html`
      <article class="clip ${c.include === false ? 'excluded' : ''}" draggable="true" data-clip="${c.id}">
        <div class="media" data-act="inspect" data-id="${c.id}">
          ${c.assets?.poster ? html`<img src="${c.assets.poster}" alt="" class="${portrait ? 'portrait' : ''}" loading="lazy">` : ''}
          <span class="n mono">${num}</span>
          ${c.meta ? html`<span class="dur mono">${timecode(c.meta.duration)}</span>` : ''}
          <span class="grab" title="Drag to reorder">${icon.grip}</span>
          ${busyClip(c) ? html`<div class="state">
              <span data-label>${c.status === 'queued' ? 'Queued for analysis' : 'Analysing'}</span>
              <div class="bar" data-clip-progress="${c.id}"><i></i></div>
            </div>` : ''}
          ${c.status === 'error' ? html`<div class="state"><span>Could not analyse this clip</span><button class="btn sm" data-act="retry-clip" data-id="${c.id}">${icon.retry} Retry</button></div>` : ''}
        </div>
        <div class="body">
          <div class="name"><span class="mono" title="${c.originalName}">${c.originalName}</span>${roomHint(c)}</div>
          ${roomSelect(c)}
          ${c.caption ? html`<div class="caption">${c.caption}</div>` : ''}
          <div class="tags">${clipTags(c)}</div>
        </div>
      </article>`;
  })}</div>`.s;
  window.scrollTo({ top: scroll });
}

// ------------------------------------------------------------------ timeline
const refreshPlanSoon = debounce(() => refreshPlan(), 350);

async function refreshPlan() {
  const seq = ++ctx.planSeq;
  renderFormatTabs();
  try {
    const plan = await api(`/api/projects/${p().id}/plan?format=${ctx.format}`);
    if (seq !== ctx.planSeq) return;
    ctx.plan = plan;
  } catch (err) {
    ctx.plan = { error: err.message };
  }
  renderTimeline();
}

function renderFormatTabs() {
  const F = meta().formats;
  const ids = Object.keys(F);
  $('#tl-formats').innerHTML = html`<div class="seg" role="group" aria-label="Preview deliverable">
    ${ids.map((id) => html`<button data-act="tl-format" data-id="${id}" aria-pressed="${id === ctx.format}">${F[id].label}<span class="muted">&nbsp;${F[id].aspect}</span></button>`)}
  </div>`.s;
}

function renderTimeline() {
  const el = $('#timeline');
  const plan = ctx.plan;
  if (!plan) {
    el.innerHTML = html`<div class="tl-wrap"><div class="tl-msg">Building edit…</div></div>`.s;
    return;
  }
  if (plan.error) {
    el.innerHTML = html`<div class="tl-wrap"><div class="tl-msg">${plan.error}</div></div>`.s;
    return;
  }
  const T = plan.total;
  const pct = (t) => `${((t / T) * 100).toFixed(3)}%`;
  const segs = plan.segments.map((s) => {
    const c = clipById(s.clipId);
    const label = meta().rooms.find((r) => r.id === s.room)?.label || c?.originalName || '';
    return html`<div class="tl-seg" style="left:${pct(s.start)};width:${pct(s.duration)};background-image:url('${c?.assets?.poster || ''}')" title="${label} · ${s.duration.toFixed(1)} s${s.speed !== 1 ? ` · ${Math.round(s.speed * 100)}% speed` : ''}"><span>${label}</span></div>`;
  });
  const fades = plan.segments
    .filter((s) => s.transitionIn?.duration)
    .map((s) => html`<div class="tl-fade" style="left:${pct(s.start)};width:${pct(s.transitionIn.duration)}"></div>`);
  if (plan.outro) {
    segs.push(html`<div class="tl-seg outro" style="left:${pct(plan.outro.start)};width:${pct(plan.outro.duration)}" title="Agent card"><span>Agent card</span></div>`);
    if (plan.outro.transitionIn?.duration) fades.push(html`<div class="tl-fade" style="left:${pct(plan.outro.start)};width:${pct(plan.outro.transitionIn.duration)}"></div>`);
  }
  const step = T > 150 ? 30 : T > 60 ? 10 : 5;
  const ticks = [];
  for (let t = 0; t <= T; t += step) ticks.push(html`<i style="left:${pct(t)}"></i><span style="left:${pct(t)}" class="mono">${runtime(t)}</span>`);
  const musicBeats = p().music?.analysis?.beats || [];
  const beatTicks = plan.music?.beatSynced
    ? musicBeats.map((b) => b - plan.music.start).filter((b) => b > 0 && b < T).map((b) => html`<i class="beat" style="left:${pct(b)}"></i>`)
    : [];
  const F = plan.format;
  el.innerHTML = html`
    <div class="tl-wrap">
      <div class="tl-top">
        <div class="tl-stats">
          <span><b class="mono">${runtime(T)}</b> runtime</span>
          <span><b>${plan.segments.length}</b> shots</span>
          <span>${plan.style.label}</span>
          <span class="mono">${F.width}×${F.height} · ${plan.fps} fps</span>
          <span>${plan.music ? (plan.music.beatSynced ? html`Cuts on the beat · <span class="mono">${Math.round(plan.music.bpm)} BPM</span>` : 'Music bed') : html`<span class="muted">No music</span>`}</span>
          ${plan.dropped?.length ? html`<span class="muted">${plan.dropped.length} clip${plan.dropped.length === 1 ? '' : 's'} left out to fit ${runtime(T)}</span>` : ''}
          ${!plan.format.maxDuration && Number(p().settings.targetDuration) > T + 5
            ? html`<span class="muted">Footage supports ${runtime(T)} at this pace — add clips for a longer film</span>` : ''}
        </div>
      </div>
      <div class="timeline">
        <div class="tl-title" style="left:${pct(plan.intro.start)};width:${pct(plan.intro.end - plan.intro.start)}">Title · ${p().label}</div>
        <div class="tl-track">${segs}${fades}</div>
        <div class="tl-ruler">${beatTicks}${ticks}</div>
      </div>
    </div>`.s;
}

// ------------------------------------------------------------------ side panel
function renderSide() {
  const side = $('#side');
  // Don't rebuild controls the user is actively dragging or typing in.
  if (side.contains(document.activeElement) && document.activeElement.matches('input[type=range], input[type=text]')) {
    renderDeliverables();
    return;
  }
  const s = p().settings;
  const M = meta();
  const lengths = [[0, 'Use best takes'], [30, '30 seconds'], [45, '45 seconds'], [60, '1 minute'], [90, '1.5 minutes'], [120, '2 minutes'], [180, '3 minutes']];
  side.innerHTML = html`
    <div class="side-sec">
      <h3>Deliverables</h3>
      <div class="stack" style="gap:6px">
        ${Object.entries(M.formats).map(([id, f]) => html`
          <label class="check">
            <input type="checkbox" data-format="${id}" ${s.formats.includes(id) ? raw('checked') : ''}>
            <span class="t"><b>${f.label} <span class="muted">· ${f.sub}</span></b>${f.note ? html`<small>${f.note}</small>` : ''}</span>
          </label>`)}
      </div>
      <div id="dlv"></div>
    </div>

    <div class="side-sec">
      <h3>Edit</h3>
      <div class="style-opts">
        ${Object.entries(M.styles).map(([id, st]) => html`
          <label class="style-opt">
            <input type="radio" name="style" value="${id}" ${s.style === id ? raw('checked') : ''} data-setting="style">
            <b>${st.label}</b><small>${st.description}</small>
          </label>`)}
      </div>
      <div class="stack" style="margin-top:14px">
        <div class="field">
          <label for="s-len">Film length</label>
          <select class="select" id="s-len" data-setting="targetDuration">
            ${lengths.map(([v, l]) => html`<option value="${v}" ${Number(s.targetDuration) === v ? raw('selected') : ''}>${l}</option>`)}
          </select>
        </div>
        <div class="grid-2">
          <div class="field"><span class="label">Frame rate</span>
            <div class="seg full">${[24, 25, 30].map((v) => html`<button data-act="set" data-key="fps" data-val="${v}" aria-pressed="${s.fps === v}">${v}</button>`)}</div>
          </div>
          <div class="field"><span class="label">Resolution</span>
            <div class="seg full">${[[1080, 'HD'], [2160, '4K']].map(([v, l]) => html`<button data-act="set" data-key="resolution" data-val="${v}" aria-pressed="${s.resolution === v}">${l}</button>`)}</div>
          </div>
        </div>
        <label class="switch"><span class="t">High-frame-rate as slow motion<small>60/120 fps clips play at ${s.fps} fps, slowed.</small></span><input type="checkbox" data-toggle="slowmo" ${s.slowmo ? raw('checked') : ''}></label>
        <label class="switch"><span class="t">Stabilise every clip<small>Slower render. Per-clip override in the inspector.</small></span><input type="checkbox" data-toggle="stabilize" ${s.stabilize ? raw('checked') : ''}></label>
      </div>
    </div>

    <div class="side-sec">
      <h3>Colour</h3>
      <div class="stack">
        <div class="seg full" role="group" aria-label="Look">
          ${Object.entries(M.looks).map(([id, l]) => html`<button data-act="set" data-key="look" data-val="${id}" aria-pressed="${s.look === id}">${l.label.split(' ')[0]}</button>`)}
        </div>
        <div class="field">
          <label for="s-strength" class="row">Correction strength <span class="mono muted" style="margin-left:auto" id="s-strength-v">${Math.round(s.gradeStrength * 100)}%</span></label>
          <input type="range" id="s-strength" min="0" max="1" step="0.05" value="${s.gradeStrength}" data-range="gradeStrength">
        </div>
        <p class="hint">White balance, exposure and contrast are measured per clip and matched across the film. Compare before and after in each clip's inspector.</p>
      </div>
    </div>

    <div class="side-sec">
      <h3>Music</h3>
      <div id="music"></div>
    </div>`.s;
  renderDeliverables();
  renderMusic();
}

function renderMusic() {
  const m = p().music;
  const el = $('#music');
  if (!el) return;
  if (!m) {
    el.innerHTML = html`
      <button class="btn" data-act="add-music" style="width:100%">${icon.music} Add a music track</button>
      <p class="hint" style="margin-top:8px">Use music you're licensed to publish. Cuts are timed to its beat and the mix is levelled to −16 LUFS.</p>`.s;
    return;
  }
  const a = m.analysis;
  el.innerHTML = html`
    <div class="music">
      <div class="ico">${icon.music}</div>
      <div style="min-width:0">
        <div class="nm" title="${m.name}">${m.name}</div>
        <div class="muted mono">${runtime(m.duration)}${a?.bpm ? ` · ${Math.round(a.bpm)} BPM` : ''}${m.status === 'analyzing' ? ' · detecting beats…' : ''}</div>
      </div>
      <div class="row"><button class="btn sm ghost" data-act="add-music">Replace</button><button class="btn sm ghost icon danger" data-act="remove-music" aria-label="Remove music">${icon.trash}</button></div>
    </div>
    ${m.status === 'error' ? html`<p class="hint warn">${m.error}</p>` : ''}
    ${a && a.confidence < 0.25 ? html`<p class="hint warn" style="margin-top:8px">No steady beat found; cuts follow shot pacing instead.</p>` : ''}`.s;
}

function renderDeliverables() {
  const el = $('#dlv');
  if (!el) return;
  const list = p().deliverables;
  if (!list.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = html`<div class="dlv-list">${list.slice(0, 12).map((d) => {
    const vertical = d.height > d.width || d.formatId === 'reel';
    let status;
    if (d.status === 'done') {
      status = html`<div class="sub mono">${runtime(d.duration)} · ${d.width}×${d.height} · ${bytes(d.sizeBytes)}</div>
        <div class="acts">
          <a class="btn sm" href="/download/${p().id}/${d.id}">${icon.download} Download</a>
          <button class="btn sm ghost" data-act="preview" data-id="${d.id}">Preview</button>
          <button class="btn sm ghost icon danger" data-act="del-dlv" data-id="${d.id}" aria-label="Delete render" style="margin-left:auto">${icon.trash}</button>
        </div>`;
    } else if (d.status === 'rendering' || d.status === 'queued') {
      status = html`<div class="row" style="gap:8px;margin-top:3px">
          <div class="bar" data-dlv-progress="${d.id}"><i style="width:${((d.progress || 0) * 100).toFixed(1)}%"></i></div>
          <span class="mono muted" data-dlv-pct="${d.id}">${d.status === 'queued' ? 'Queued' : `${Math.round((d.progress || 0) * 100)}%`}</span>
        </div>
        <div class="acts"><button class="btn sm ghost" data-act="cancel-dlv" data-id="${d.id}">Cancel</button></div>`;
    } else {
      status = html`<div class="${d.status === 'error' ? 'err-msg' : 'sub'}">${d.status === 'cancelled' ? 'Cancelled' : d.error || 'Failed'}</div>
        <div class="acts">
          <button class="btn sm" data-act="rerender" data-fmt="${d.formatId}">${icon.retry} Render again</button>
          <button class="btn sm ghost icon danger" data-act="del-dlv" data-id="${d.id}" aria-label="Remove" style="margin-left:auto">${icon.trash}</button>
        </div>`;
    }
    return html`
      <div class="dlv">
        <div class="pv ${d.poster ? 'play' : ''} ${vertical ? 'v' : ''}" ${d.poster ? raw(`style="background-image:url('${d.poster}')" data-act="preview" data-id="${d.id}"`) : ''}></div>
        <div class="t">
          <div class="top"><b>${d.label}</b><span class="sub">${d.sub}</span></div>
          ${status}
        </div>
      </div>`;
  })}</div>`.s;
}

// ------------------------------------------------------------------ actions
async function patchSettings(patch) {
  Object.assign(p().settings, patch);
  try {
    await api(`/api/projects/${p().id}`, { method: 'PATCH', body: { settings: patch } });
  } catch (err) {
    toast(err.message, { error: true });
  }
}
const patchSettingsSoon = debounce(patchSettings, 300);

async function patchClip(id, body) {
  try {
    await api(`/api/projects/${p().id}/clips/${id}`, { method: 'PATCH', body });
  } catch (err) {
    toast(err.message, { error: true });
  }
}

async function uploadFiles(files) {
  const list = [...files].filter((f) => /\.(mp4|mov|m4v|mts|m2ts|mxf|avi|mkv|webm|3gp)$/i.test(f.name));
  const skipped = files.length - list.length;
  if (!list.length) {
    toast('Those files are not video clips.', { error: true });
    return;
  }
  const form = new FormData();
  for (const f of list) form.append('files', f, f.name);
  const total = list.reduce((a, f) => a + f.size, 0);
  const box = $('#upload-status');
  const draw = (frac) => {
    box.innerHTML = html`<div class="upload-bar"><span>Uploading ${list.length} clip${list.length === 1 ? '' : 's'}</span>
      <div class="bar"><i style="width:${(frac * 100).toFixed(1)}%"></i></div>
      <span class="mono muted">${bytes(frac * total)} / ${bytes(total)}</span></div>`.s;
  };
  draw(0);
  try {
    await upload(`/api/projects/${p().id}/clips`, form, draw);
    if (skipped) toast(`${skipped} non-video file${skipped === 1 ? '' : 's'} skipped.`);
  } catch (err) {
    toast(err.message, { error: true });
  } finally {
    box.innerHTML = '';
  }
}

async function uploadMusic(file) {
  const form = new FormData();
  form.append('file', file, file.name);
  try {
    await upload(`/api/projects/${p().id}/music`, form);
  } catch (err) {
    toast(err.message, { error: true });
  }
}

async function startRender(formats) {
  try {
    const res = await api(`/api/projects/${p().id}/render`, { method: 'POST', body: formats ? { formats } : {} });
    toast(`${res.length} render${res.length === 1 ? '' : 's'} queued.`);
  } catch (err) {
    toast(err.message, { error: true });
  }
}

function editDetails() {
  const pr = p();
  const m = openModal(html`
    <form>
      <div class="modal-head"><h2>Listing details</h2><div class="right"><button type="button" class="btn ghost icon" data-close aria-label="Close">${icon.close}</button></div></div>
      <div class="modal-body">${listingForm(pr)}</div>
      <div class="modal-foot">
        <button type="button" class="btn ghost danger" data-del style="margin-right:auto">${icon.trash} Delete listing</button>
        <button type="button" class="btn ghost" data-close>Cancel</button>
        <button class="btn primary" type="submit">Save</button>
      </div>
    </form>`.s);
  const form = m.el.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(`/api/projects/${pr.id}`, { method: 'PATCH', body: readListingForm(form) });
      m.close();
    } catch (err) {
      toast(err.message, { error: true });
    }
  });
  form.querySelector('[data-del]').addEventListener('click', async () => {
    if (!confirm(`Delete ${pr.name}, its footage and every render? This cannot be undone.`)) return;
    await api(`/api/projects/${pr.id}`, { method: 'DELETE' });
    m.close();
    location.hash = '#/';
  });
}

function previewDeliverable(id) {
  const d = p().deliverables.find((x) => x.id === id);
  if (!d?.file) return;
  const vertical = d.height > d.width;
  openModal(html`
    <div class="modal-head"><h2>${d.label}</h2><span class="muted">${d.sub}</span>
      <div class="right"><a class="btn sm" href="/download/${p().id}/${d.id}">${icon.download} Download</a><button class="btn ghost icon" data-close aria-label="Close">${icon.close}</button></div></div>
    <div class="modal-body" style="padding:0;background:#000">
      <video src="${d.file}" poster="${d.poster}" controls autoplay playsinline style="width:100%;max-height:78vh;${vertical ? 'aspect-ratio:9/16;' : ''}margin:0 auto"></video>
    </div>`.s, { wide: !vertical });
}

function bind() {
  const sig = { signal: ctx.abort.signal };
  const root = ctx.root;

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const id = b.dataset.id;
    if (act === 'add-footage') $('#file-input').click();
    else if (act === 'add-music') $('#music-input').click();
    else if (act === 'remove-music') api(`/api/projects/${p().id}/music`, { method: 'DELETE' });
    else if (act === 'render') startRender();
    else if (act === 'rerender') startRender([b.dataset.fmt]);
    else if (act === 'edit-details') editDetails();
    else if (act === 'auto-order') api(`/api/projects/${p().id}/order`, { method: 'POST', body: { auto: true } });
    else if (act === 'inspect') openInspector(id);
    else if (act === 'retry-clip') { e.stopPropagation(); api(`/api/projects/${p().id}/clips/${id}/retry`, { method: 'POST' }); }
    else if (act === 'preview') previewDeliverable(id);
    else if (act === 'cancel-dlv') api(`/api/projects/${p().id}/deliverables/${id}/cancel`, { method: 'POST' });
    else if (act === 'del-dlv') api(`/api/projects/${p().id}/deliverables/${id}`, { method: 'DELETE' });
    else if (act === 'tl-format') { ctx.format = id; refreshPlan(); }
    else if (act === 'set') {
      const v = b.dataset.val;
      patchSettings({ [b.dataset.key]: /^\d+$/.test(v) ? Number(v) : v });
      $$(`[data-act="set"][data-key="${b.dataset.key}"]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }
  }, sig);

  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-room]')) patchClip(t.dataset.room, { room: t.value || null });
    else if (t.matches('[data-format]')) {
      const formats = $$('[data-format]').filter((x) => x.checked).map((x) => x.dataset.format);
      patchSettings({ formats });
    } else if (t.matches('[data-setting]')) {
      const v = t.value;
      patchSettings({ [t.dataset.setting]: /^\d+$/.test(v) ? Number(v) : v });
    } else if (t.matches('[data-toggle]')) patchSettings({ [t.dataset.toggle]: t.checked });
    else if (t.id === 'file-input') { uploadFiles(t.files); t.value = ''; }
    else if (t.id === 'music-input' && t.files[0]) { uploadMusic(t.files[0]); t.value = ''; }
  }, sig);

  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-range="gradeStrength"]')) {
      $('#s-strength-v').textContent = `${Math.round(t.value * 100)}%`;
      patchSettingsSoon({ gradeStrength: Number(t.value) });
    }
  }, sig);

  // Reorder by drag and drop.
  root.addEventListener('dragstart', (e) => {
    const card = e.target.closest?.('[data-clip]');
    if (!card) return;
    ctx.dragId = card.dataset.clip;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/x-clip', ctx.dragId);
  }, sig);
  root.addEventListener('dragend', () => {
    ctx.dragId = null;
    $$('.clip').forEach((c) => c.classList.remove('dragging', 'drop-before', 'drop-after'));
  }, sig);
  root.addEventListener('dragover', (e) => {
    if (!ctx.dragId) return;
    const card = e.target.closest('[data-clip]');
    if (!card || card.dataset.clip === ctx.dragId) return;
    e.preventDefault();
    const r = card.getBoundingClientRect();
    const after = e.clientX > r.left + r.width / 2;
    $$('.clip').forEach((c) => c.classList.remove('drop-before', 'drop-after'));
    card.classList.add(after ? 'drop-after' : 'drop-before');
  }, sig);
  root.addEventListener('drop', (e) => {
    if (!ctx.dragId) return;
    e.preventDefault();
    const card = e.target.closest('[data-clip]');
    if (!card) return;
    const after = card.classList.contains('drop-after');
    const ids = p().clips.map((c) => c.id).filter((x) => x !== ctx.dragId);
    const at = ids.indexOf(card.dataset.clip) + (after ? 1 : 0);
    ids.splice(at, 0, ctx.dragId);
    p().clips.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    p().manualOrder = true;
    renderBin();
    api(`/api/projects/${p().id}/order`, { method: 'POST', body: { order: ids } });
  }, sig);

  // Files dropped from the desktop anywhere on the page.
  const overlay = $('#drop-overlay');
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => { if (hasFiles(e) && !ctx.dragId) { depth++; overlay.classList.add('on'); } }, sig);
  window.addEventListener('dragleave', (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; overlay.classList.remove('on'); } }, sig);
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); }, sig);
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    overlay.classList.remove('on');
    const files = [...e.dataTransfer.files];
    const audio = files.filter((f) => /\.(mp3|m4a|wav|aiff?|flac|aac)$/i.test(f.name));
    const video = files.filter((f) => !audio.includes(f));
    if (video.length) uploadFiles(video);
    if (audio.length) uploadMusic(audio[0]);
  }, sig);
  window.addEventListener('hashchange', () => { ctx.inspector = null; ctx.abort?.abort(); }, { once: true });
}

// ------------------------------------------------------------------ clip inspector
function openInspector(id) {
  const c = clipById(id);
  if (!c || !c.analysis) return;
  const m = openModal(html`<div id="insp"></div>`.s, { wide: true, onClose: () => (ctx.inspector = null) });
  ctx.inspector = { id, el: m.el, close: m.close, tab: 'color', split: 50 };
  drawInspector();
}

function refreshInspector() {
  const ins = ctx.inspector;
  const c = clipById(ins.id);
  if (!c) return ins.close();
  // Keep the open sliders stable while the user drags them.
  if (ins.el.contains(document.activeElement) && document.activeElement.matches('input[type=range]')) return;
  drawInspector();
}

function motionGraph(c, tin, tout) {
  const env = c.analysis.motion?.envelope || [];
  const rate = c.analysis.motion?.envelopeRate || 10;
  const D = c.meta.duration;
  const W = 600, H = 64;
  const max = Math.max(0.006, ...env);
  const pts = env.map((v, i) => `${((i / rate / D) * W).toFixed(1)},${(H - 4 - (v / max) * (H - 10)).toFixed(1)}`).join(' ');
  const x = (t) => ((t / D) * W).toFixed(1);
  return html`<svg class="motion-graph" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Camera shake over time">
    <rect x="0" y="0" width="${x(tin)}" height="${H}" fill="rgba(0,0,0,0.55)"/>
    <rect x="${x(tout)}" y="0" width="${W - x(tout)}" height="${H}" fill="rgba(0,0,0,0.55)"/>
    <polyline points="${pts}" fill="none" stroke="#c9a86a" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
    <line x1="${x(tin)}" x2="${x(tin)}" y1="0" y2="${H}" stroke="#ecebe5" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <line x1="${x(tout)}" x2="${x(tout)}" y1="0" y2="${H}" stroke="#ecebe5" stroke-width="1" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

function drawInspector() {
  const ins = ctx.inspector;
  const c = clipById(ins.id);
  const pr = p();
  const s = pr.settings;
  const a = c.analysis;
  const M = c.meta;
  const tin = c.trimIn ?? a.trimIn;
  const tout = c.trimOut ?? a.trimOut;
  const strength = c.gradeStrength ?? s.gradeStrength;
  const v = encodeURIComponent(`${s.look}-${strength}`);
  const frame = (g) => `/api/projects/${pr.id}/clips/${c.id}/frame.jpg?graded=${g}&v=${v}`;
  const stab = c.stabilize === undefined || c.stabilize === null ? 'project' : c.stabilize ? 'on' : 'off';
  const cam = [M.make, M.model].filter(Boolean).join(' ');

  $('#insp', ins.el).innerHTML = html`
    <div class="modal-head">
      <h2 class="mono" style="font:500 14px var(--mono)">${c.originalName}</h2>
      ${c.caption ? html`<span class="muted">${c.caption}</span>` : ''}
      <div class="right"><button class="btn ghost icon" data-close aria-label="Close">${icon.close}</button></div>
    </div>
    <div class="modal-body">
      <div class="insp">
        <div>
          <div class="tabs" role="tablist">
            <button role="tab" data-tab="color" aria-selected="${ins.tab === 'color'}">Colour · before / after</button>
            <button role="tab" data-tab="play" aria-selected="${ins.tab === 'play'}">Playback</button>
          </div>
          ${ins.tab === 'color'
            ? html`<div class="compare" style="--split:${ins.split}%">
                <img src="${frame(0)}" alt="Original frame">
                <img class="after" src="${frame(1)}" alt="Corrected frame">
                <div class="handle"></div>
                <span class="lbl l caps">Camera</span><span class="lbl r caps">Corrected</span>
                <input type="range" min="0" max="100" value="${ins.split}" data-split aria-label="Compare position">
              </div>`
            : html`<div class="viewer"><video src="${c.assets.proxy}" controls playsinline preload="metadata" data-player></video></div>`}
          <div style="margin-top:16px">
            <div class="row" style="margin-bottom:6px"><span class="caps">Camera shake · usable range</span>
              <span class="mono muted" style="margin-left:auto" data-trim-label>${timecode(tin)} → ${timecode(tout)} · ${(tout - tin).toFixed(1)} s</span></div>
            <div data-graph>${motionGraph(c, tin, tout)}</div>
            <div class="trim-row">
              <div class="field"><label class="row">In <span class="mono muted" style="margin-left:auto">auto ${timecode(a.trimIn)}</span></label><input type="range" min="0" max="${M.duration}" step="0.05" value="${tin}" data-trim="trimIn"></div>
              <div class="field"><label class="row">Out <span class="mono muted" style="margin-left:auto">auto ${timecode(a.trimOut)}</span></label><input type="range" min="0" max="${M.duration}" step="0.05" value="${tout}" data-trim="trimOut"></div>
            </div>
            ${c.trimIn !== undefined || c.trimOut !== undefined ? html`<button class="linkish" data-reset-trim style="margin-top:8px">Reset to automatic trim</button>` : html`<p class="hint" style="margin-top:8px">Shaky starts and stops are trimmed automatically. The edit uses the steadiest stretch inside this range.</p>`}
          </div>
        </div>
        <div class="stack">
          <label class="switch"><span class="t">Use in edit<small>Excluded clips stay in the bin.</small></span><input type="checkbox" data-include ${c.include !== false ? raw('checked') : ''}></label>
          <div class="field"><span class="label">Room</span>${roomSelect(c)}
            ${c.roomSource === 'ai' ? html`<span class="hint">Labelled automatically · ${Math.round((c.roomConfidence || 0) * 100)}% confidence</span>` : c.roomSource === 'auto' ? html`<span class="hint">From camera metadata / file name</span>` : ''}
          </div>
          <div class="field"><span class="label">Stabilise</span>
            <div class="seg full">
              ${[['project', `Project (${s.stabilize ? 'on' : 'off'})`], ['on', 'On'], ['off', 'Off']].map(([k, l]) => html`<button data-stab="${k}" aria-pressed="${stab === k}">${l}</button>`)}
            </div>
          </div>
          <div class="field">
            <label class="row">Colour correction <span class="mono muted" style="margin-left:auto" data-gs-label>${Math.round(strength * 100)}%${c.gradeStrength === undefined ? ' · project' : ''}</span></label>
            <input type="range" min="0" max="1" step="0.05" value="${strength}" data-gs>
            ${c.gradeStrength !== undefined ? html`<button class="linkish" data-gs-reset style="justify-self:start">Use project setting</button>` : ''}
          </div>
          <div class="hr"></div>
          <dl class="kv">
            <dt>Resolution</dt><dd class="mono">${M.width}×${M.height}</dd>
            <dt>Frame rate</dt><dd class="mono">${M.fps.toFixed(M.fps % 1 ? 2 : 0)} fps</dd>
            <dt>Codec</dt><dd class="mono">${M.codec} · ${M.bitDepth}-bit</dd>
            <dt>Dynamic range</dt><dd>${M.hdr ? M.hdr.toUpperCase() + ' → SDR' : 'SDR'}</dd>
            <dt>Duration</dt><dd class="mono">${timecode(M.duration)}</dd>
            <dt>Camera motion</dt><dd>${a.motion.direction === 'static' ? 'Locked off' : `Moving ${a.motion.direction}`}</dd>
            ${cam ? html`<dt>Camera</dt><dd>${cam}</dd>` : ''}
            ${M.creationTime ? html`<dt>Captured</dt><dd>${new Date(M.creationTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</dd>` : ''}
            <dt>File size</dt><dd class="mono">${bytes(M.sizeBytes)}</dd>
          </dl>
          <div class="hr"></div>
          <button class="btn ghost danger" data-remove-clip style="justify-self:start">${icon.trash} Remove clip</button>
        </div>
      </div>
    </div>`.s;

  const el = ins.el;
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { ins.tab = b.dataset.tab; drawInspector(); }));
  const split = el.querySelector('[data-split]');
  split?.addEventListener('input', () => {
    ins.split = Number(split.value);
    el.querySelector('.compare').style.setProperty('--split', `${ins.split}%`);
  });
  const player = el.querySelector('[data-player]');

  const trims = el.querySelectorAll('[data-trim]');
  const readTrims = () => {
    let i = Number(trims[0].value), o = Number(trims[1].value);
    if (o - i < 0.5) {
      if (document.activeElement === trims[0]) i = Math.max(0, o - 0.5); else o = Math.min(M.duration, i + 0.5);
    }
    return [i, o];
  };
  trims.forEach((r) => {
    r.addEventListener('input', () => {
      const [i, o] = readTrims();
      el.querySelector('[data-graph]').innerHTML = motionGraph(c, i, o).s;
      el.querySelector('[data-trim-label]').textContent = `${timecode(i)} → ${timecode(o)} · ${(o - i).toFixed(1)} s`;
      if (player) player.currentTime = r.dataset.trim === 'trimIn' ? i : o;
    });
    r.addEventListener('change', () => {
      const [i, o] = readTrims();
      c.trimIn = i; c.trimOut = o;
      patchClip(c.id, { trimIn: i, trimOut: o });
    });
  });
  el.querySelector('[data-reset-trim]')?.addEventListener('click', () => patchClip(c.id, { trimIn: null, trimOut: null }));
  el.querySelector('[data-include]').addEventListener('change', (e) => patchClip(c.id, { include: e.target.checked }));
  el.querySelector('[data-room]').addEventListener('change', (e) => patchClip(c.id, { room: e.target.value || null }));
  el.querySelectorAll('[data-stab]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.stab;
    patchClip(c.id, { stabilize: k === 'project' ? null : k === 'on' });
  }));
  const gs = el.querySelector('[data-gs]');
  gs.addEventListener('input', () => { el.querySelector('[data-gs-label]').textContent = `${Math.round(gs.value * 100)}%`; });
  gs.addEventListener('change', () => patchClip(c.id, { gradeStrength: Number(gs.value) }));
  el.querySelector('[data-gs-reset]')?.addEventListener('click', () => patchClip(c.id, { gradeStrength: null }));
  el.querySelector('[data-remove-clip]').addEventListener('click', async () => {
    if (!confirm(`Remove ${c.originalName} from this listing?`)) return;
    ins.close();
    await api(`/api/projects/${pr.id}/clips/${c.id}`, { method: 'DELETE' });
  });
}
