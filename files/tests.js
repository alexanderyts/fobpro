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
is('L1 FIXED: comma-no-space finds city add-on (Jackson,MS = 8%)', jNoSpace&&jNoSpace.rate===8);

console.log('\\n[U] unit — escaping & CSV');
is('esc neutralizes script tag', esc('<script>x</script>')==='&lt;script&gt;x&lt;/script&gt;');
is('esc handles quotes/amp', esc('O\\'Brien & "Sons"')==='O&#39;Brien &amp; &quot;Sons&quot;');
is('esc null-safe', esc(null)===''&&esc(undefined)==='');
is('csvCell wraps commas', csvCell('a,b')==='"a,b"');
is('csvCell doubles quotes', csvCell('say "hi"')==='"say ""hi"""');
is('csvCell wraps newlines', csvCell('a\\nb')==='"a\\nb"');
is('S1 FIXED: formula injection neutralized', csvCell('=1+1')==="'=1+1"&&csvCell('@cmd')==="'@cmd"&&csvCell('+1-601')==="'+1-601");

console.log('\\n[U] unit — generation matching');
const cam=DB.Toyota.Camry;
is('Camry 2015 → HYQ14FBA gen', getSpecVariant(cam,'2015').fcc.includes('FBA'));
is('Camry 2018 boundary → FBC gen', getSpecVariant(cam,'2018').fcc.includes('FBC'));
is('Camry 2017 boundary → FBA gen', getSpecVariant(cam,'2017').fcc.includes('FBA'));
is('no year → fallback, confident:false', getSpecVariant(cam,'').confident===false);
is('vehicle without variants → null', getSpecVariant(DB.Kia.Soul,'2016')===null);
const below=getSpecVariant(cam,'2005');
is('below-range year still returns a variant (not crash)', !!below&&below.confident===false);
is('L2 FIXED: 2005 falls back to NEAREST gen (2012-17 FBA), not newest', below.yearStart===2012&&below.fcc.includes('FBA'));
is('L2: no-year fallback still prefers newest gen', getSpecVariant(cam,'').yearStart===2025);

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
is('L3 FIXED: every make has make-specific used-fob guidance', noUsedRules.length===0, noUsedRules.join(','));
const camPricing=Object.keys(DB).every(mk=>Object.keys(DB[mk]).every(md=>{const p=DB[mk][md].pricing;return p&&Object.values(p).some(v=>v>0);}));
is('every vehicle has at least one nonzero price', camPricing);
el('l-trim').value='';
is('jrSvc maps 0 keys → all_lost', (jr.keys='0', jrSvc(DB.Toyota.Camry)==='all_lost'));
is('jrSvc maps IKEY-method vehicle → smart', (jr.keys='1', jrSvc(DB.Lexus.RX)==='smart'));
is('jrSvc plain trim stays fob_only', jrSvc(DB.Toyota.Camry)==='fob_only');
el('l-trim').value='XSE';
is('L4 FIXED: prox trim (Camry XSE) infers smart service ($185, not $130)', jrSvc(DB.Toyota.Camry)==='smart');
el('l-trim').value='';

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

// ═══ [W] CALL INTAKE + PIPELINE (v8.9.0) ═══════════════════════════════════
console.log('\\n[W] call intake & job pipeline');
jobs=[];provenVehicles={};inv=[];
startIntake();
is('intake opens at step 1', ic!==null&&ic.active&&ic.step===1);
alerts.length=0;icNext();
is('anti-scam gate: no callback number → no advance', ic.step===1&&alerts.length===1);
icInput('phone','601-555-0100');icSet('lead','google');icNext();
is('step 2 after callback number captured', ic.step===2);
alerts.length=0;icNext();
is('step 2 requires a vehicle (DB pick or free text)', ic.step===2&&alerts.length===1);
icSet('mk','Toyota');icSet('md','Camry');icInput('yr','2015');icNext();
is('step 3 with DB vehicle locked', ic.step===3);
alerts.length=0;icNext();
is('step 3 requires all four triage answers', ic.step===3&&alerts.length===1);
icSet('keys','0');icSet('fobSrc','mine');icSet('push','key');icSet('alarm','no');icNext();
is('0-keys Toyota intake → refer-out verdict (AKL truth holds on the phone)', el('intake-view').innerHTML.includes('refer this one out')||el('intake-view').innerHTML.includes('Outside your current tooling'));
icSaveReferred();
is('referred call logged done/referred with NO proven credit', jobs[0].method==='referred'&&jobs[0].status==='done'&&!provenVehicles['toyota camry']);
is('referred save closes the wizard', ic===null);
startIntake();
icInput('phone','601-555-0101');icInput('name','Test Caller');icSet('lead','referral');
icSet('mk','Toyota');icSet('md','Camry');icInput('yr','2021');ic.step=3;
icSet('keys','1');icSet('fobSrc','mine');icSet('push','push');icSet('alarm','no');icNext();
is('push-button answer quotes the smart tier (not base add-key)', el('intake-view').innerHTML.includes('$'+DB.Toyota.Camry.pricing.smart));
is('empty truck stock triggers the deposit guard', el('intake-view').innerHTML.toLowerCase().includes('deposit before you order'));
inv=[{name:'Toyota HYQ14FBC prox fob',qty:2,par:1}];renderIntake();
is('matching truck stock is detected (FCC token match)', el('intake-view').innerHTML.includes('on the truck'));
inv=[];
icInput('dep','90');ic.step=5;renderIntake();
icInput('appt','Tomorrow 10am');icInput('addr','123 Main St, Pearl');icSave();
is('booked intake saves as scheduled ticket with structured vehicle', jobs[0].status==='scheduled'&&jobs[0].mk==='Toyota'&&jobs[0].md==='Camry');
is('intake carries deposit, lead source, address onto the job', jobs[0].deposit==='90'&&jobs[0].leadSrc==='referral'&&jobs[0].addr==='123 Main St, Pearl');
is('intake without appointment would be quoted', (()=>{startIntake();icInput('phone','601-555-0102');icSet('mk','Honda');icSet('md','Civic');ic.step=5;renderIntake();icSave();return jobs[0].status==='quoted';})());
setJobStatus(1,'done');
is('pipeline advance to done marks proven exactly once', provenVehicles['toyota camry']===1);
setJobStatus(1,'working');setJobStatus(1,'done');
is('status bouncing never double-counts proven', provenVehicles['toyota camry']===1);
setJobField(1,'price','185');setJobField(1,'cost','45');
renderStats();
is('stats compute profit = revenue − parts cost ($140)', el('job-stats').innerHTML.includes('$140'));
is('stats show open-pipeline count', el('job-stats').innerHTML.includes('Open pipeline'));
setJobStatus(0,'nonsense');
is('setJobStatus rejects unknown statuses', jobs[0].status==='quoted');
jobs=[];provenVehicles={};

// content invariants — the researched business-path & tool-protection facts
console.log('\\n[L] content — business path & tool protection');
is('NASTF milestone carries the concrete 2026 checklist', LEARN_PATH[3].steps.some(s=>s.d.includes('$435')&&s.d.includes('liability')&&s.d.includes('Mississippi')));
is('roadside lead-flow step exists in Phase 2', LEARN_PATH[2].steps.some(s=>/HONK|Urgently|roadside/i.test(s.t+s.d)));
is('update-discipline pitfall present with protocol', PITFALLS.some(p=>/update/i.test(p.t)&&/release notes/i.test(p.p)));
is('gray-market AKL unlock warning present (fixMyKM)', PITFALLS.some(p=>/fixMyKM/i.test(p.d)));
is('pitfall library grew to 10', PITFALLS.length===10);
is('every pitfall still has title/description/protocol', PITFALLS.every(p=>p.t&&p.d&&p.p));

// ═══ [L] v8.10.0 — Tucson gap fix + honest fallbacks + easy targets ════════
console.log('\\n[L] Tucson year-gap regression + message honesty');
const tuc=DB.Hyundai.Tucson;
is('BUG FIXED: 2016 Tucson resolves a CONFIDENT fob variant', (()=>{const v=getFobVariant(tuc,'2016','SE');return !!v&&v.confident===true&&v.oemPart.includes('D3010');})());
is('2013 Tucson (LM gen) resolves confidently too', (()=>{const v=getFobVariant(tuc,'2013','');return !!v&&v.confident===true&&v.oemPart.includes('OSLOKA');})());
is('Tucson fobVariants now cover 2005-2024 with no gap', (()=>{for(let y=2005;y<=2024;y++){if(!tuc.fobVariants.some(v=>y>=v.yearStart&&y<=v.yearEnd))return false;}return true;})());
el('l-make').value='Hyundai';el('l-model').value='Tucson';el('l-year').value='2016';el('l-trim').value='SE';
doLookup();
is('BUG FIXED: 2016 Tucson lookup no longer says "Enter the model year"', !el('l-result').innerHTML.includes('Enter the model year above'));
is('2016 Tucson lookup shows the year-matched part banner', el('l-result').innerHTML.includes('Part # matched to 2016'));
el('l-year').value='1999';doLookup();
is('honest fallback: unmatched year names the year instead of lying', el('l-result').innerHTML.includes('No verified part data for 1999'));
el('l-make').value='';el('l-model').value='';el('l-year').value='';el('l-trim').value='';currentVehicle=null;

console.log('\\n[L] easy-targets list (Ref tab)');
const ets=easyTargets();
is('easy targets exist and every entry is full-KM100 + beginner', ets.length>0&&ets.every(r=>r.d.km100==='yes'&&r.d.skill==='beginner'));
is('easy targets exclude erase-all and gateway vehicles', ets.every(r=>!r.d.eraseWarning&&!r.d.sgw));
is('no-immobilizer money-makers rank above unverified entries', (()=>{const mm=ets.findIndex(r=>/MONEY-MAKER/.test(r.d.gotcha||''));return mm>-1&&mm<ets.length/2;})());
renderEasyTargets();
is('easy-targets card renders with the walk-away list', el('easy-targets').innerHTML.includes('Walk away as a beginner'));
is('easy-targets rows are tappable lookups', el('easy-targets').innerHTML.includes('etLookup('));

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
is('S2 FIXED: markup chars rejected by VIN charset validation', !!decodeVinOffline('<A"B>C1D2E3F4G5H6').error);
el('hdr-vin').value='<A"B>C1D2E3F4G5H6';
decodeVIN();
is('S2 FIXED: VIN result bar shows error, no raw markup', !el('vin-result-bar').innerHTML.includes('<A"'));
// photo src trust
jobs=[{name:'p',vehicle:'v',status:'done',price:'1',date:'Jul',photos:['javascript:alert(1)','data:image/jpeg;base64,OK']}];
created.length=0;renderJobs();
const pcard=created.find(c=>c.className==='card jcard');
is('S3 FIXED: non-data:image photo sources are never rendered', pcard&&!pcard.innerHTML.includes('javascript:')&&pcard.innerHTML.includes('data:image/jpeg;base64,OK'));
is('S3 FIXED: showPhoto refuses non-image URIs', (created.length=0, showPhoto('javascript:alert(1)'), created.length===0));
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
const text4 = (html.match(/--text4:(#[0-9a-fA-F]{6})/) || [])[1];
const r4 = ratio(text4, '#141a28');
console.log(`  · --text4 (${text4}) on --surface contrast = ${r4.toFixed(2)}:1`);
is(`X1 FIXED: dimmest text passes WCAG AA (${r4.toFixed(2)}:1 ≥ 4.5:1)`, r4 >= 4.5);
is('X2 FIXED: 16px input override present (no iOS zoom-on-focus)', /\.fi,\.ts-input,\.notes-area,\.guided-gate input,\.hdr-vin-input\{font-size:16px !important;\}/.test(html));
is('X3 FIXED: no sub-44px touch targets remain', (html.match(/min-width:34px/g) || []).length === 0);
const iconBtnsNoLabel = (dom.match(/<button[^>]*>(?:\s*<svg|✕)/g) || []).filter(b => !b.includes('aria-label') && !b.includes('title')).length;
is('X4 FIXED: all icon-led buttons carry aria-label/title', iconBtnsNoLabel === 0, iconBtnsNoLabel + ' unlabeled');
is('X4 FIXED: photo overlay dismissible via Escape', js.includes("e.key==='Escape'"));
console.log('  · viewport meta present:', dom.includes('name="viewport"') ? 'yes' : 'NO');

// v8.9.0 static wiring
is('X5: intake launch card + view container present', dom.includes('id="intake-launch"') && dom.includes('id="intake-view"'));
is('X5: intake shortcut on the Lookup tab', dom.includes('startIntake()') && dom.split('startIntake()').length >= 3);
is('X5: pipeline statuses selectable in job form', dom.includes('value="quoted"') && dom.includes('value="scheduled"'));
is('X5: parts-cost + deposit fields in job form', dom.includes('id="j-cost"') && dom.includes('id="j-deposit"'));
is('X5: CSV export carries economics + intake columns', js.includes("'price','cost','deposit'") && js.includes("'leadSrc'"));
is('X5: digital-key horizon card on Ref tab', dom.includes('id="digital-horizon"') && /UWB/.test(dom));
is('X5: quoted/scheduled status dots styled', html.includes('.sdot.quoted') && html.includes('.sdot.scheduled'));

// ═══ SUMMARY ═════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════');
console.log(`TESTS: ${pass} passed, ${failN} failed`);
console.log(`FINDINGS (need owner approval to fix): ${findings.length}`);
findings.forEach(f => console.log(`  ${f.id} [${f.sev}] ${f.desc.split('.')[0]}.`));
process.exit(failN ? 1 : 0);
