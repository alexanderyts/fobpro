import { api, html, raw, ago, facts, cityLine, icon, openModal, toast, $ } from '../lib.js';

function deliverableStatus(p) {
  const d = p.deliverables;
  const active = d.filter((x) => x.status === 'rendering' || x.status === 'queued');
  if (active.length) {
    const r = d.find((x) => x.status === 'rendering');
    return html`<span class="status-line"><i class="pip busy"></i>Rendering${r ? ` ${Math.round(r.progress * 100)}%` : ''} · ${active.length} in queue</span>`;
  }
  const done = d.filter((x) => x.status === 'done');
  if (done.length) {
    const kinds = new Set(done.map((x) => x.formatId)).size;
    return html`<span class="status-line"><i class="pip ok"></i>${kinds} deliverable${kinds === 1 ? '' : 's'} ready</span>`;
  }
  if (d.some((x) => x.status === 'error')) return html`<span class="status-line"><i class="pip err"></i>Render failed</span>`;
  if (p.clipCount && p.readyCount < p.clipCount) return html`<span class="status-line"><i class="pip busy"></i>Analysing footage</span>`;
  if (p.clipCount) return html`<span class="status-line"><i class="pip"></i>Ready to render</span>`;
  return html`<span class="status-line"><i class="pip"></i>Awaiting footage</span>`;
}

export function renderListings(root, state) {
  const list = state.projects;
  root.innerHTML = html`
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Listings</h1>
          <div class="sub">${list.length ? `${list.length} propert${list.length === 1 ? 'y' : 'ies'}` : 'One project per property shoot'}</div>
        </div>
        <div class="actions"><button class="btn primary" data-act="new">${icon.plus} New listing</button></div>
      </div>
      ${list.length
        ? html`<div class="panel">
            <div class="listings-head caps"><span></span><span>Property</span><span>Footage</span><span>Status</span><span>Updated</span></div>
            <div class="listings">
              ${list.map((p) => html`
                <a class="listing" href="#/p/${p.id}">
                  <div class="thumb">${p.poster ? html`<img src="${p.poster}" alt="" loading="lazy">` : ''}</div>
                  <div style="min-width:0">
                    <div class="addr">${p.name}</div>
                    <div class="city">${cityLine(p.address) || '—'}</div>
                    ${facts(p.details).length ? html`<div class="facts">${facts(p.details).join('  ·  ')}</div>` : ''}
                  </div>
                  <div class="dim">${p.clipCount ? `${p.clipCount} clip${p.clipCount === 1 ? '' : 's'}` : html`<span class="muted">No footage</span>`}</div>
                  <div>${deliverableStatus(p)}</div>
                  <div class="muted">${ago(p.updatedAt)}</div>
                </a>`)}
            </div>
          </div>`
        : html`<div class="panel"><div class="empty">
            <h2>Start with a property</h2>
            <p>Create a listing, drop in the shoot's clips, and Threshold cuts, colour-corrects and exports every version you deliver.</p>
            <div class="steps">
              <div><span class="caps">01</span><b>Upload footage</b><span>Gimbal, phone and drone clips in any order.</span></div>
              <div><span class="caps">02</span><b>Review the edit</b><span>Tour order, trims, grade and pacing are automatic. Adjust anything.</span></div>
              <div><span class="caps">03</span><b>Deliver</b><span>Branded film, MLS-unbranded tour and a vertical reel in one pass.</span></div>
            </div>
            <button class="btn primary" data-act="new">${icon.plus} New listing</button>
          </div></div>`}
    </div>`.s;

  root.querySelectorAll('[data-act="new"]').forEach((b) => b.addEventListener('click', () => newListingModal()));
}

export function listingForm(p = {}) {
  const a = p.address || {};
  const d = p.details || {};
  const labels = ['Just listed', 'For sale', 'Open house', 'Under contract', 'Just sold', 'For lease', 'Coming soon'];
  const current = p.label || 'Just listed';
  return html`
    <div class="stack">
      <div class="field"><label for="f-line1">Street address</label><input class="input" id="f-line1" name="line1" required value="${a.line1 || ''}" placeholder="1482 Larkspur Lane" autocomplete="off"></div>
      <div class="grid-2" style="grid-template-columns: 1.6fr 0.7fr 0.9fr">
        <div class="field"><label for="f-city">City</label><input class="input" id="f-city" name="city" value="${a.city || ''}"></div>
        <div class="field"><label for="f-state">State</label><input class="input" id="f-state" name="state" value="${a.state || ''}" maxlength="20"></div>
        <div class="field"><label for="f-zip">ZIP</label><input class="input" id="f-zip" name="zip" value="${a.zip || ''}" inputmode="numeric" maxlength="10"></div>
      </div>
      <div class="grid-4">
        <div class="field"><label for="f-price">List price</label><input class="input" id="f-price" name="price" value="${d.price || ''}" inputmode="numeric" placeholder="689,000"></div>
        <div class="field"><label for="f-beds">Beds</label><input class="input" id="f-beds" name="beds" value="${d.beds || ''}" inputmode="decimal"></div>
        <div class="field"><label for="f-baths">Baths</label><input class="input" id="f-baths" name="baths" value="${d.baths || ''}" inputmode="decimal"></div>
        <div class="field"><label for="f-sqft">Sq ft</label><input class="input" id="f-sqft" name="sqft" value="${d.sqft || ''}" inputmode="numeric"></div>
      </div>
      <div class="field">
        <label for="f-label">Title label</label>
        <select class="select" id="f-label" name="label">
          ${labels.map((l) => html`<option ${l === current ? raw('selected') : ''}>${l}</option>`)}
          ${labels.includes(current) ? '' : html`<option selected>${current}</option>`}
        </select>
      </div>
      <p class="hint">Shown in the opening title. Price and room counts are optional — leave them blank to keep them off the video.</p>
    </div>`;
}

export function readListingForm(form) {
  const v = (n) => form.querySelector(`[name="${n}"]`).value.trim();
  return {
    address: { line1: v('line1'), city: v('city'), state: v('state'), zip: v('zip') },
    details: { price: v('price'), beds: v('beds'), baths: v('baths'), sqft: v('sqft') },
    label: v('label'),
  };
}

function newListingModal() {
  const m = openModal(html`
    <form>
      <div class="modal-head"><h2>New listing</h2><div class="right"><button type="button" class="btn ghost icon" data-close aria-label="Close">${icon.close}</button></div></div>
      <div class="modal-body">${listingForm()}</div>
      <div class="modal-foot"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary" type="submit">Create listing</button></div>
    </form>`.s);
  $('#f-line1', m.el).focus();
  m.el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = readListingForm(e.target);
    if (!data.address.line1) return $('#f-line1', m.el).focus();
    try {
      const p = await api('/api/projects', { method: 'POST', body: data });
      m.close();
      location.hash = `#/p/${p.id}`;
    } catch (err) {
      toast(err.message, { error: true });
    }
  });
}
