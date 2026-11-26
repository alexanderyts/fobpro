import { api, upload, html, raw, $, debounce, icon, toast } from '../lib.js';

export async function renderBrand(root, state) {
  const b = await api('/api/brand');
  const fields = [
    ['agentName', 'Agent or team name', 'Dana Whitfield'],
    ['agentTitle', 'Title', 'Realtor'],
    ['brokerage', 'Brokerage', 'Harbor & Pine Realty'],
    ['phone', 'Phone', '(601) 555-0142'],
    ['email', 'Email', 'dana@harborpine.com'],
    ['website', 'Website', 'harborpine.com'],
  ];
  root.innerHTML = html`
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Brand kit</h1>
          <div class="sub">Closing card for branded deliverables. MLS tours are always exported without it.</div>
        </div>
      </div>
      <div class="brand-grid">
        <form class="panel" id="brand-form" autocomplete="off">
          <div class="panel-head"><h2>Details</h2><span class="right muted" id="save-state">Saved</span></div>
          <div class="panel-body stack">
            ${fields.map(([k, l, ph]) => html`<div class="field"><label for="b-${k}">${l}</label><input class="input" id="b-${k}" name="${k}" value="${b[k] || ''}" placeholder="${ph}"></div>`)}
            <div class="hr"></div>
            <div class="field">
              <span class="label">Logo</span>
              <div class="logo-drop">
                <div class="logo-box">${b.logoUrl ? html`<img src="${b.logoUrl}" alt="Logo">` : html`<span class="muted mono">none</span>`}</div>
                <div class="stack" style="gap:6px">
                  <div class="row">
                    <button type="button" class="btn sm" data-act="logo">${icon.upload} ${b.logoUrl ? 'Replace' : 'Upload'}</button>
                    ${b.logoUrl ? html`<button type="button" class="btn sm ghost danger" data-act="logo-del">Remove</button>` : ''}
                  </div>
                  <span class="hint">PNG with transparency works best. Shown in white space above the name.</span>
                </div>
              </div>
              <input type="file" id="logo-input" accept=".png,.jpg,.jpeg,.webp" hidden>
            </div>
            <div class="field">
              <label for="b-accent">Accent colour</label>
              <div class="swatch">
                <input type="color" id="b-accent-pick" value="${b.accentColor}" aria-label="Pick accent colour">
                <input class="input mono" id="b-accent" name="accentColor" value="${b.accentColor}" style="width:110px" maxlength="7">
                <span class="hint">Used for the thin rules in titles.</span>
              </div>
            </div>
          </div>
        </form>
        <div class="panel">
          <div class="panel-head"><h2>Closing card preview</h2>
            <div class="right"><div class="seg" role="group" aria-label="Title style">
              <button data-style="sans" aria-pressed="true">Walkthrough</button><button data-style="serif" aria-pressed="false">Signature</button>
            </div></div>
          </div>
          <div class="panel-body"><div class="preview-frame" id="preview"></div>
            <p class="hint" style="margin-top:10px">Shown for the last ${raw('4&ndash;5')} seconds over a softened still of the final shot. Exact typography matches the render.</p>
          </div>
        </div>
      </div>
    </div>`.s;

  let serif = false;
  const form = $('#brand-form');
  const read = () => Object.fromEntries([...form.querySelectorAll('[name]')].map((i) => [i.name, i.value.trim()]));

  const drawPreview = () => {
    const v = read();
    const role = [v.agentTitle, v.brokerage].filter(Boolean).join('  ·  ');
    const contact = [v.phone, v.email].filter(Boolean).join('     ');
    const logo = form.querySelector('.logo-box img')?.getAttribute('src');
    $('#preview').innerHTML = html`
      <div class="bg"></div><div class="scrim"></div>
      <div class="preview-card">
        ${logo ? html`<img src="${logo}" alt="">` : ''}
        <div class="nm ${serif ? 'serif' : ''}">${v.agentName || 'Agent name'}</div>
        ${role ? html`<div class="role">${role}</div>` : ''}
        <div class="rule" style="background:${/^#[0-9a-f]{6}$/i.test(v.accentColor) ? v.accentColor : '#C9A86A'}"></div>
        ${contact ? html`<div class="ct">${contact.replace(/ {5}/g, '  ')}</div>` : ''}
        ${v.website ? html`<div class="web">${v.website}</div>` : ''}
      </div>`.s;
  };

  const save = debounce(async () => {
    const v = read();
    if (v.accentColor && !/^#[0-9a-f]{6}$/i.test(v.accentColor)) delete v.accentColor;
    try {
      await api('/api/brand', { method: 'PUT', body: v });
      $('#save-state').textContent = 'Saved';
    } catch (err) {
      $('#save-state').textContent = 'Not saved';
      toast(err.message, { error: true });
    }
  }, 500);

  form.addEventListener('input', (e) => {
    if (e.target.id === 'b-accent-pick') $('#b-accent').value = e.target.value;
    if (e.target.id === 'b-accent' && /^#[0-9a-f]{6}$/i.test(e.target.value)) $('#b-accent-pick').value = e.target.value;
    $('#save-state').textContent = 'Saving…';
    drawPreview();
    save();
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  root.querySelectorAll('[data-style]').forEach((btn) =>
    btn.addEventListener('click', () => {
      serif = btn.dataset.style === 'serif';
      root.querySelectorAll('[data-style]').forEach((x) => x.setAttribute('aria-pressed', String(x === btn)));
      drawPreview();
    }),
  );
  root.querySelector('[data-act="logo"]').addEventListener('click', () => $('#logo-input').click());
  root.querySelector('[data-act="logo-del"]')?.addEventListener('click', async () => {
    await api('/api/brand/logo', { method: 'DELETE' });
    renderBrand(root, state);
  });
  $('#logo-input').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f, f.name);
    try {
      await upload('/api/brand/logo', fd);
      renderBrand(root, state);
    } catch (err) {
      toast(err.message, { error: true });
    }
  });
  drawPreview();
}
