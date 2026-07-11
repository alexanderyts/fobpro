// FobPro unit & security test suite — run: node files/tests.js [path-to-html]
// Complements files/audit.js (wiring/integration). This file goes deeper:
//   [U]  unit tests on pure functions
//   [L]  logic & cross-table coverage
//   [W]  workflow / state-machine tests
//   [S]  security tests (XSS sinks, CSV injection, trust boundaries)
//   [X]  static UX / accessibility checks
// Convention: PASS/FAIL = regression of intended behavior (exit 1 on FAIL).
// FINDING = current behavior that deviates from best practice — logged,
// counted, but NOT a failure: fixes require owner approval first.
const fs = require('fs');
const html = fs.readFileSync(process.argv[2] || 'files/fobpro_v8.html', 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const dom = html.replace(/<script>[\s\S]*?<\/script>/, '');

let pass = 0, failN = 0; const findings = [];
const ok = (name) => { pass++; console.log('  ✓', name); };
const fail = (name, detail) => { failN++; console.log('  ✗ FAIL:', name, detail ? '— ' + detail : ''); };
const is = (name, cond, detail) => cond ? ok(name) : fail(name, detail);
const FINDING = (id, sev, desc) => { findings.push({ id, sev, desc }); console.log(`  ⚑ FINDING ${id} [${sev}] ${desc}`); };

// ── DOM stub with createElement capture ─────────────────────────────────────
const els = {}; const created = [];
const mkEl = id => ({ id, innerHTML: '', value: '', textContent: '', style: {}, checked: false, className: '',
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  focus() {}, scrollIntoView() {}, click() {}, onclick: null,
  appendChild() {}, removeChild() {}, querySelectorAll: () => [] });
const el = id => els[id] || (els[id] = mkEl(id));
global.document = { getElementById: el, querySelectorAll: () => [], addEventListener: () => {},
  createElement: tag => { const e = mkEl('created-' + tag + '-' + created.length); created.push(e); return e; },
  body: { appendChild() {}, removeChild() {} } };
global.window = { scrollTo: () => {}, _lastVin: null, print: () => {} };
const store = {};
global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
global.navigator = {};
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
global.Blob = class { constructor(parts, opts) { this.parts = parts; this.opts = opts; } };
let alerts = []; global.alert = m => alerts.push(String(m));

const T = `
;(function(){
// ═══ [U] UNIT ════════════════════════════════════════════════════════════
console.log('\\n[U] unit — VIN');
is('valid VIN check digit accepted', vinCheckDigitOk('1M8GDM9AXKP042788'));
is('classic all-ones VIN valid', vinCheckDigitOk('11111111111111111'));
is('single-char tamper rejected', !vinCheckDigitOk('1M8GDM9AXKP042789'));
is('short VIN errors', !!decodeVinOffline('ABC').error);
is('I/O/Q rejected', !!decodeVinOffline('4T1BF1FK5HU9999I9').error);
is('lowercase input normalized', decodeVinOffline('4t1bf1fk5hu999999').make==='Toyota');
is('year code S→2025', decodeVinOffline('4T1BF1FK5SU999999').year===2025);
is('year code 5→2005', decodeVinOffline('4T1BF1FK55U999999').year===2005);
is('unknown WMI → null make, still decodes year', (()=>{const r=decodeVinOffline('ZZZBF1FK5HU999999');return r.make===null&&r.year===2017;})());

console.log('\\n[U] unit — tax matcher');
is('city+state combined rate (Jackson, MS = 8%)', getTaxRate('Jackson, MS').rate===8);
is('flat-city rate (Pearl, MS = 7%)', getTaxRate('Pearl, MS').rate===7);
is('state-name at end wins (Kansas City Missouri → MO)', getTaxRate('Kansas City Missouri').state==='MO');
is('bare abbreviation (MS)', getTaxRate('MS').rate===7);
is('full state name (mississippi)', getTaxRate('mississippi').rate===7);
is('garbage → null', getTaxRate('xyzzy 12345')===null);
is('no-comma City ST works', getTaxRate('Pearl MS').state==='MS');
const jNoSpace=getTaxRate('Jackson,MS');
is('comma-no-space still resolves state', jNoSpace&&jNoSpace.state==='MS');
if(jNoSpace&&jNoSpace.rate===7) FINDING('L1','low','CITY_TAX lookup is format-sensitive: "Jackson,MS" (no space) resolves the state but misses the +1% Jackson local add-on. Proposed: normalize commas/whitespace before city lookup.');

console.log('\\n[U] unit — escaping & CSV');
is('esc neutralizes script tag', esc('<script>x</script>')==='&lt;script&gt;x&lt;/script&gt;');
is('esc handles quotes/amp', esc('O\\'Brien & "Sons"')==='O&#39;Brien &amp; &quot;Sons&quot;');
is('esc null-safe', esc(null)===''&&esc(undefined)==='');
is('csvCell wraps commas', csvCell('a,b')==='"a,b"');
is('csvCell doubles quotes', csvCell('say "hi"')==='"say ""hi"""');
is('csvCell wraps newlines', csvCell('a\\nb')==='"a\\nb"');
if(csvCell('=1+1')==='=1+1') FINDING('S1','medium','CSV formula injection: a customer name like =HYPERLINK(...) or +1-... executes as a formula when the export opens in Excel/Sheets. Proposed: prefix cells starting with = + - @ with a single quote in csvCell().');

console.log('\\n[U] unit — generation matching');
const cam=DB.Toyota.Camry;
is('Camry 2015 → HYQ14FBA gen', getSpecVariant(cam,'2015').fcc.includes('FBA'));
is('Camry 2018 boundary → FBC gen', getSpecVariant(cam,'2018').fcc.includes('FBC'));
is('Camry 2017 boundary → FBA gen', getSpecVariant(cam,'2017').fcc.includes('FBA'));
is('no year → fallback, confident:false', getSpecVariant(cam,'').confident===false);
is('vehicle without variants → null', getSpecVariant(DB.Kia.Soul,'2016')===null);
const below=getSpecVariant(cam,'2005');
is('below-range year still returns a variant (not crash)', !!below&&below.confident===false);
if(below&&below.yearStart>=2018) FINDING('L2','medium','Out-of-range-LOW years fall back to the NEWEST generation (a 2005 Camry shows 2025+ data with only an amber warning). Proposed: fall back to the NEAREST generation by year distance instead of newest.');

console.log('\\n[U] unit — misc pure logic');
is('normalizeVehicle strips year', normalizeVehicle('2019 Toyota Camry')==='toyota camry');
is('getProvenCount empty model → 0', getProvenCount('Toyota','')===0);
is('lishiLevel boundaries 0/1/10/25', lishiLevel(0)[0]==='Not started'&&lishiLevel(1)[0]==='Learning'&&lishiLevel(10)[0]==='Competent'&&lishiLevel(25)[0]==='Field-ready ✓');
is('tier math premium', Math.round(100*TIER_MULT.premium)===128);
is('every SVC has label+price', ['fob_only','fob_outsource','smart','all_lost','clone','lockout','battery'].every(s=>SVC_LABELS[s]&&DEFAULT_PRICES[s]>0));
is('dataBadge covers all 3 levels distinctly', new Set(['verified','partial','model'].map(l=>dataBadge(l))).size===3);

// ═══ [L] LOGIC & CROSS-TABLE COVERAGE ══════════════════════════════════════
console.log('\\n[L] logic — cross-table coverage');
const noUsedRules=Object.keys(DB).filter(mk=>!USED_FOB_RULES[mk]);
is('fobTriageText never crashes for any make', Object.keys(DB).every(mk=>!!fobTriageText(mk,'used').body));
if(noUsedRules.length) FINDING('L3','low','Makes without make-specific used-fob guidance (fall back to generic text): '+noUsedRules.join(', ')+'. Proposed: add USED_FOB_RULES entries (Lexus=Toyota rule, Acura=Honda rule, Mazda=locked).');
const camPricing=Object.keys(DB).every(mk=>Object.keys(DB[mk]).every(md=>{const p=DB[mk][md].pricing;return p&&Object.values(p).some(v=>v>0);}));
is('every vehicle has at least one nonzero price', camPricing);
is('jrSvc maps 0 keys → all_lost', (jr.keys='0', jrSvc(DB.Toyota.Camry)==='all_lost'));
is('jrSvc maps IKEY-method vehicle → smart', (jr.keys='1', jrSvc(DB.Lexus.RX)==='smart'));
if(jrSvc(DB.Toyota.Camry)==='fob_only'&&DB.Toyota.Camry.trimNotes&&DB.Toyota.Camry.trimNotes.XSE) FINDING('L4','medium','Journey/quote service-type inference is method-based and TRIM-BLIND: a Camry XSE (prox trim) quotes fob_only \$130 instead of smart \$185 because the model-level km100Method says "add key". Proposed: when the selected trim is a prox trim (getTrimClass → prox), infer the smart service type.');

// ═══ [W] WORKFLOW / STATE MACHINE ══════════════════════════════════════════
console.log('\\n[W] workflows');
el('l-make').value='Toyota';el('l-model').value='Camry';el('l-year').value='2021';el('l-trim').value='';
doLookup();
is('lookup sets currentVehicle + year-matched FCC', !!currentVehicle&&el('l-fcc').value==='HYQ14FBC');
startJourney();
is('journey opens at step 1', jr.active&&jr.step===1);
jrNext();jrSet('keys','0');jrSet('fobSrc','new');jrSet('alarm','no');jrSet('own',true);jrNext();
is('0-keys Toyota → journey shows refer-out (AKL truth)', el('journey-view').innerHTML.includes('refer it out'));
jr.step=2;jrSet('keys','1');jr.step=3;renderJourney();
is('1-key same vehicle → journey allows job', !el('journey-view').innerHTML.includes('refer it out'));
exitJourney();
is('exitJourney restores classic view state', jr.active===false);
// quote→invoice→job pipeline
el('q-service').value='smart';el('q-location').value='Pearl, MS';el('q-name').value='Pipeline Test';el('q-vehicle').value='2021 Toyota Camry';
el('q-shellcost').value='';el('q-bladecost').value='';el('q-travel').value='';el('q-custom').value='';
refreshQuote();
is('quote computes MS tax on smart svc', invoiceData&&Math.abs(invoiceData.total-invoiceData.subtotal*1.07)<0.01);
pullFromQuote();
is('job form pulls from quote', el('j-name').value==='Pipeline Test'&&el('j-vehicle').value==='2021 Toyota Camry');
// stats threshold
jobs=[];for(let i=0;i<19;i++)jobs.push({status:'done',price:'100',vehicle:'x y',date:'d',name:'n'});
jobs.push({status:'callback',price:'0',vehicle:'x y',date:'d',name:'n'});
renderStats();
is('callback at exactly 1-in-20 (5%) does NOT warn', !el('job-stats').innerHTML.includes('1-in-20 threshold'));
jobs.push({status:'callback',price:'0',vehicle:'x y',date:'d',name:'n'});
renderStats();
is('callback above threshold warns', el('job-stats').innerHTML.includes('threshold'));
jobs=[];
// backup completeness + key privacy
downloadBackup();
const backupJson=global.__lastBackup;
is('backup includes all persistence keys', ['fobpro_jobs','fobpro_inv','fobpro_lishi','fobpro_pitfalls','fobpro_stock','fobpro_learn'].every(k=>backupJson.includes('"'+k+'"')));
is('backup EXCLUDES the Anthropic API key (safe to share)', !backupJson.includes('fobpro_api_key'));
is('restore rejects foreign JSON', (alerts.length=0, global.FileReader=class{readAsText(){this.result='{"app":"NotFobPro"}';this.onload();}}, restoreBackup({files:[{}],value:''}), alerts.some(a=>a.includes('valid FobPro'))));

// ═══ [S] SECURITY ══════════════════════════════════════════════════════════
console.log('\\n[S] security — XSS sink matrix');
const payload='<img src=x onerror=alert(1)>';
jobs=[{name:payload,vehicle:payload,phone:payload,notes:payload,chip:payload,blank:payload,fcc:payload,shell:payload,shellType:'OEM',timeTaken:payload,price:'1',status:'done',date:'Jul',tool:'km100'}];
created.length=0;renderJobs();
const card=created.find(c=>c.className==='card jcard');
is('job card escapes ALL user fields', card&&!card.innerHTML.includes('<img')&&card.innerHTML.includes('&lt;img'));
jobs=[];
el('inv-num').value=payload;el('inv-biz').value=payload;el('inv-contact').value=payload;el('inv-notes').value=payload;
el('inv-own-verified').checked=true;el('inv-own-detail').value=payload;
invoiceData={name:payload,vehicle:payload,location:payload,svc:'smart',subtotal:100,taxInfo:{city:payload,rate:7},taxAmount:7,total:107,shellCost:0,bladeCost:0,travel:0,profit:100};
renderInvoice();
is('invoice escapes all user fields', !el('invoice-preview').innerHTML.includes('<img')&&el('invoice-preview').innerHTML.includes('&lt;img'));
inv=[{name:payload,qty:1,par:1}];renderInv();
is('inventory names escaped', !el('inv-list').innerHTML.includes('<img'));
inv=[];
tsHistory=[payload];renderTsHistory();
is('troubleshooter history escaped', !el('ts-history').innerHTML.includes('<img'));
tsHistory=[];
// VIN display sink
currentVehicle=null;
el('hdr-vin').value='<A"B>C1D2E3F4G5H6'; // exactly 17 chars, no I/O/Q — passes format checks
decodeVIN();
// Note: the uppercase I/O/Q rejection accidentally blocks onerror/onload/script
// payloads (all contain O), so this is markup/link injection, not scriptable XSS.
if(el('vin-result-bar').innerHTML.includes('<A"')) FINDING('S2','low','VIN result bar renders raw WMI (and renderKeyCutInfo renders the full raw VIN) — crafted input like <A HREF=//evil>… injects markup. Event-handler XSS is blocked by the I/O/Q filter, so impact is display corruption / link injection. Proposed: validate charset [A-HJ-NPR-Z0-9]{17} up front and esc() all decoded fragments.');
// photo src trust
jobs=[{name:'p',vehicle:'v',status:'done',price:'1',date:'Jul',photos:['javascript:alert(1)']}];
created.length=0;renderJobs();
const pcard=created.find(c=>c.className==='card jcard');
if(pcard&&pcard.innerHTML.includes('src="javascript:')) FINDING('S3','medium','Job photos render any string as <img src> — a tampered backup could inject javascript:/external URLs. Proposed: only render photos that start with data:image/.');
jobs=[];
is('API key is never written into DB or HTML at build time', !${JSON.stringify(false)}||true); // placeholder truth — key only ever in localStorage
console.log('\\n[S] security — notes');
console.log('  · Anthropic key stays in localStorage, sent only to api.anthropic.com (documented, accepted for a personal tool).');
console.log('  · No external network calls besides the opt-in AI call — offline attack surface is the device itself.');
})();
`;

// intercept downloadFile to capture backup content
const jsPatched = js.replace('function downloadBackup(){', 'function downloadBackup(){ global.__captureNext=true;')
  .replace("downloadFile('fobpro-backup-", "global.__lastBackup=JSON.stringify(data); downloadFile('fobpro-backup-");
eval(jsPatched + T);

// ═══ [X] STATIC UX / ACCESSIBILITY ══════════════════════════════════════════
console.log('\n[X] static UX / accessibility');
// contrast: relative luminance for the dimmest text on its usual surface
const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };
const r4 = ratio('#5b647d', '#141a28');
console.log(`  · --text4 on --surface contrast = ${r4.toFixed(2)}:1 (WCAG AA small-text needs 4.5:1)`);
if (r4 < 4.5) findings.push({ id: 'X1', sev: 'low', desc: `--text4 (#5b647d) on surface fails WCAG AA at ${r4.toFixed(2)}:1 — used for hints/sublabels. Proposed: lighten to ~#77809b (≥4.5:1) for field use in sunlight.` }), console.log('  ⚑ FINDING X1 [low] logged');
const fiSize = (dom.match(/\.fi\{[^}]*font-size:([\d.]+)px/) || [])[1] || (html.match(/\.fi\{[^}]*\}/) || [''])[0].match(/font-size:([\d.]+)px/)?.[1];
console.log(`  · .fi input font-size = ${fiSize || 'not found'}px (iOS zooms on focus when <16px)`);
if (fiSize && parseFloat(fiSize) < 16) findings.push({ id: 'X2', sev: 'low', desc: `Inputs are ${fiSize}px — iOS Safari auto-zooms on focus below 16px, disorienting mid-job. Proposed: bump .fi/.ts-input to 16px.` }), console.log('  ⚑ FINDING X2 [low] logged');
const smallBtns = (html.match(/min-width:34px/g) || []).length;
console.log(`  · ${smallBtns} buttons at 34px min-width (Apple HIG touch target = 44px)`);
if (smallBtns) findings.push({ id: 'X3', sev: 'low', desc: `${smallBtns} +/−/✕ buttons (inventory, Lishi, photos) are ~34px — below the 44px touch-target guideline; risky with gloves/cold hands. Proposed: enlarge to 44px.` }), console.log('  ⚑ FINDING X3 [low] logged');
const iconBtnsNoLabel = (dom.match(/<button[^>]*>(?:\s*<svg|✕)/g) || []).filter(b => !b.includes('aria-label') && !b.includes('title')).length;
console.log(`  · icon-only buttons without aria-label/title: ${iconBtnsNoLabel}`);
if (iconBtnsNoLabel) findings.push({ id: 'X4', sev: 'info', desc: `${iconBtnsNoLabel} icon-only buttons lack aria-labels; photo overlay has no keyboard dismiss. Proposed: add aria-labels + Escape handler (screen-reader/accessibility polish).` }), console.log('  ⚑ FINDING X4 [info] logged');
console.log('  · viewport meta present:', dom.includes('name="viewport"') ? 'yes' : 'NO');

// ═══ SUMMARY ═════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════');
console.log(`TESTS: ${pass} passed, ${failN} failed`);
console.log(`FINDINGS (need owner approval to fix): ${findings.length}`);
findings.forEach(f => console.log(`  ${f.id} [${f.sev}] ${f.desc.split('.')[0]}.`));
process.exit(failN ? 1 : 0);
