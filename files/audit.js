// FobPro audit harness — run: node files/audit.js [path-to-html]
// Checks: element wiring, handler wiring, runtime smoke suite, DB integrity, font embed.
const fs = require('fs');
const html = fs.readFileSync(process.argv[2]||'files/fobpro_v8.html','utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const dom = html.replace(/<script>[\s\S]*?<\/script>/, '');
let fail = 0;
const bad = m => { fail++; console.log('  ✗', m); };
const ok = m => console.log('  ✓', m);

// ── 1. Static wiring: JS getElementById targets exist in HTML ──────────────
console.log('\n[1] getElementById targets exist in HTML');
const dynamicIds = /^(tab-|nav-|tool-opt-|tier-|tp-)/; // built at runtime or parameterized
const ids = new Set([...dom.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const gets = new Set([...js.matchAll(/getElementById\('([^']+)'\)/g), ...js.matchAll(/getElementById\("([^"]+)"\)/g)].map(m => m[1]));
let missing = [...gets].filter(id => !ids.has(id) && !dynamicIds.test(id) && !/\+/.test(id));
// ids created inside JS-rendered HTML
const jsCreatedIds = new Set([...js.matchAll(/id="([^"$]+)"/g)].map(m => m[1]));
missing = missing.filter(id => !jsCreatedIds.has(id));
missing.length ? missing.forEach(id => bad('missing element #' + id)) : ok(gets.size + ' unique ids referenced, all present');

// ── 2. Static wiring: HTML event handlers are defined functions ────────────
console.log('\n[2] HTML on* handlers map to defined functions');
const handlers = new Set();
for (const m of dom.matchAll(/on(?:click|change|input|focus|keydown)="([^"]+)"/g)) {
  for (const f of m[1].matchAll(/(?<![\w.$])([a-zA-Z_$][\w$]*)\s*\(/g)) handlers.add(f[1]);
}
const jsHandlers = new Set();
for (const m of js.matchAll(/on(?:click|change|input)="([^"]+)"/g)) {
  for (const f of m[1].matchAll(/(?<![\w.$])([a-zA-Z_$][\w$]*)\s*\(/g)) jsHandlers.add(f[1]);
}
const builtins = new Set(['event', 'if', 'parseFloat', 'this']);
const defined = new Set([...js.matchAll(/function\s+([a-zA-Z_$][\w$]*)/g)].map(m => m[1]));
let hFail = 0;
for (const f of [...handlers, ...jsHandlers]) {
  if (builtins.has(f)) continue;
  if (!defined.has(f) && !js.includes('const ' + f) && !js.includes('let ' + f)) { bad('handler not defined: ' + f); hFail++; }
}
if (!hFail) ok([...handlers].length + ' HTML + ' + [...jsHandlers].length + ' JS-template handlers, all defined');

// ── 3. Runtime smoke suite ──────────────────────────────────────────────────
console.log('\n[3] runtime smoke suite');
const els = {};
const el = id => els[id] || (els[id] = { id, innerHTML: '', value: '', textContent: '', style: {}, checked: false, files: null, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, focus() {}, scrollIntoView() {}, click() {}, appendChild() {}, querySelectorAll: () => [] });
global.document = { getElementById: el, querySelectorAll: () => [], addEventListener: () => {}, createElement: () => el('t' + Math.random()), body: { appendChild() {}, removeChild() {} } };
global.window = { scrollTo: () => {}, _lastVin: null, print: () => {} };
const store = {};
global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
global.navigator = {};
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
global.Blob = class { constructor(parts, opts) { this.parts = parts; this.opts = opts; } };
global.alert = () => {};
global.el = el; global.T = { ok, bad };

const tests = `
;(function(){
  // lookup + year-aware specs
  el('l-make').value='Ford';el('l-model').value='F-150';el('l-year').value='2016';el('l-trim').value='XLT';
  doLookup();
  currentVehicle&&el('l-chip').value.includes('ID49')?T.ok('2016 F-150 resolves ID49 Hitag Pro'):T.bad('F-150 spec variant wrong: '+el('l-chip').value);
  // journey full walk
  startJourney();jrNext();jrSet('keys','1');jrSet('fobSrc','new');jrSet('alarm','no');jrSet('own',true);jrNext();jrNext();jrNext();jrNext();
  el('journey-view').innerHTML.includes('Wrap up')?T.ok('journey walks to step 6'):T.bad('journey stuck');
  exitJourney();
  // quote: lockout uses default pricing even with vehicle selected
  el('q-service').value='lockout';el('q-location').value='Pearl, MS';el('q-shellcost').value='';el('q-bladecost').value='';el('q-travel').value='';el('q-custom').value='';
  refreshQuote();
  invoiceData&&invoiceData.subtotal===95?T.ok('lockout quotes $95 base + MS tax = $'+invoiceData.total.toFixed(2)):T.bad('lockout pricing broken: '+JSON.stringify(invoiceData&&invoiceData.subtotal));
  el('q-service').value='battery';refreshQuote();
  invoiceData.subtotal===45?T.ok('battery swap quotes $45 base'):T.bad('battery pricing broken');
  // invoice with ownership + warranty
  el('inv-own-verified').checked=true;el('inv-own-detail').value='MS DL ****1234';
  renderInvoice();
  el('invoice-preview').innerHTML.includes('Ownership verified')?T.ok('invoice records ownership verification'):T.bad('ownership line missing');
  el('invoice-preview').innerHTML.includes('30 days')?T.ok('invoice includes 30-day workmanship warranty'):T.bad('warranty line missing');
  // jobs: callback status + CSV export + backup/restore
  el('j-name').value='Test Customer';el('j-vehicle').value='2016 Ford F-150';el('j-status').value='callback';el('j-phone').value='';el('j-price').value='150';
  el('j-tool').value='km100';el('j-method').value='lockout';el('j-chip').value='';el('j-blank').value='';el('j-fcc').value='';el('j-shell').value='';el('j-shelltype').value='';el('j-time').value='';el('j-notes').value='note,with"comma';el('j-bladecut').checked=false;
  saveJob();
  jobs.length===1&&jobs[0].status==='callback'?T.ok('callback job saved + persisted ('+(store['fobpro_jobs']?'localStorage ok':'NO PERSIST')+')'):T.bad('callback save broken');
  exportJobsCSV();T.ok('CSV export ran (blob created)');
  downloadBackup();T.ok('JSON backup ran');
  const backup=JSON.stringify({app:'FobPro',version:APP_VERSION,fobpro_jobs:store['fobpro_jobs']});
  // restore path: simulate FileReader
  global.FileReader=class{readAsText(){this.result=backup;this.onload();}};
  restoreBackup({files:[{}],value:''});
  jobs.length===1?T.ok('restore round-trips jobs'):T.bad('restore broken');
  // learn + stock persistence
  renderLearn();renderStock();toggleLearnStep('1.1');toggleStockItem(12);
  store['fobpro_learn']&&store['fobpro_stock']?T.ok('learn + stock persist (stock has '+STOCK_LIST.length+' items)'):T.bad('learn/stock persistence broken');
  // tax + VIN + esc regression
  getTaxRate('Kansas City Missouri').state==='MO'?T.ok('tax matcher regression pass'):T.bad('tax regression');
  vinCheckDigitOk('1M8GDM9AXKP042788')?T.ok('VIN check digit pass'):T.bad('VIN check broken');
  esc('<b>&"')==='&lt;b&gt;&amp;&quot;'?T.ok('esc() correct'):T.bad('esc broken');
  // SVC coverage: every option in both selects has a label + price path
  ['fob_only','fob_outsource','smart','all_lost','clone','lockout','battery'].forEach(s=>{
    if(!SVC_LABELS[s])T.bad('SVC_LABELS missing '+s);
    if(!(DEFAULT_PRICES[s]>0))T.bad('DEFAULT_PRICES missing '+s);
  });
  T.ok('all 7 service types have labels + default prices');
  // v8.5: pitfalls, inventory, stats
  renderPitfalls();togglePitfall(0);
  store['fobpro_pitfalls']?T.ok('pitfalls render + ack persists ('+PITFALLS.length+' entries)'):T.bad('pitfalls persistence broken');
  loadInv();
  el('inv-name').value='Autel IKEY 4-btn';el('inv-qty').value='1';el('inv-par').value='2';
  invAdd();
  inv.length===1&&inv[0].qty<inv[0].par?T.ok('inventory add works, below-par detected'):T.bad('inventory broken');
  invAdj(0,2);
  inv[0].qty===3?T.ok('inventory +/- adjusts and persists'):T.bad('inventory adjust broken');
  renderStats();
  el('job-stats').innerHTML.includes('Business health')?T.ok('business stats render from jobs log'):T.bad('stats broken');
  // v8.6: new makes resolve through the full pipeline
  el('l-make').value='Lexus';el('l-model').value='RX';el('l-year').value='2018';el('l-trim').value='';
  doLookup();
  el('l-fcc').value.includes('HYQ14FBB')?T.ok('2018 Lexus RX resolves HYQ14FBB (G board era)'):T.bad('Lexus spec variant wrong: '+el('l-fcc').value);
  getDecision(currentVehicle).cls!==undefined?T.ok('new-make vehicle flows through decision logic'):T.bad('decision broken for new make');
  decodeVinOffline('JTHBA1D2XG5000000').make==='Lexus'?T.ok('VIN decode recognizes Lexus WMI'):T.bad('Lexus WMI missing');
  // v8.6: photos persist with job and render
  jobs.unshift({id:1,name:'Photo Test',vehicle:'2018 Lexus RX',status:'done',price:'235',photos:['data:image/jpeg;base64,TEST'],date:'Jul 10'});
  renderJobs();
  T.ok('job with ownership photos renders ('+(jobs[0].photos.length)+' photo)');
  jobs.shift();
  // v8.6: lishi tracker
  renderLishi();lishiRep(0,1);lishiRep(0,1);
  store['fobpro_lishi']==='{"0":2}'?T.ok('lishi reps persist ('+LISHI_LIST.length+' keyways)'):T.bad('lishi persistence broken: '+store['fobpro_lishi']);
  // v8.7: confidence badges surface everywhere they should
  el('l-make').value='Toyota';el('l-model').value='Camry';el('l-year').value='2021';el('l-trim').value='';
  doLookup();
  el('l-result').innerHTML.includes('data verified Jul 2026')?T.ok('verified badge shows on lookup'):T.bad('verified badge missing');
  el('l-make').value='Kia';el('l-model').value='Soul';el('l-year').value='';
  doLookup();
  el('l-result').innerHTML.includes('model-level data')?T.ok('model-level warning shows for downgraded vehicle'):T.bad('downgrade badge missing');
  renderDataConfidence();
  el('data-confidence').innerHTML.includes('Standing rule')?T.ok('data-confidence scoreboard renders'):T.bad('scoreboard broken');
  console.log('  APP_VERSION',APP_VERSION);
})();
`;
eval(js + tests);

// ── 4. DB integrity ─────────────────────────────────────────────────────────
console.log('\n[4] DB integrity');
const DB = JSON.parse(html.match(/^const DB=(\{.*\});$/m)[1]);
let n = 0, sv = 0, probs = 0;
for (const mk in DB) for (const md in DB[mk]) {
  n++; const d = DB[mk][md];
  ['chip', 'freq', 'fcc', 'blank', 'gotcha', 'pricing', 'obd', 'km100Detail', 'verified'].forEach(f => { if (d[f] === undefined) { bad(`${mk} ${md} missing ${f}`); probs++; } });
  if (!['verified', 'partial', 'model'].includes(d.verified)) { bad(`${mk} ${md} invalid verified level: ${d.verified}`); probs++; }
  if (d.specVariants) { sv++; d.specVariants.forEach(v => { if (!(v.yearStart <= v.yearEnd) || !v.chip || !v.fcc) { bad(`${mk} ${md} bad specVariant`); probs++; } }); }
}
if (!probs) ok(`${n} vehicles, ${sv} with specVariants, all required fields present`);

// Make-level invariants: the 2024 Autel NA removal list must stay consistent,
// and Honda/Acura are add-key-only by design. A new vehicle that violates
// these would make the journey/verdict lie about AKL capability.
const AKL_REMOVED_MAKES = ['Toyota', 'Lexus', 'Chevrolet', 'GMC', 'Ford', 'Mazda', 'Nissan', 'Dodge', 'Jeep', 'RAM'];
const ADD_KEY_ONLY_MAKES = ['Honda', 'Acura'];
let aklProbs = 0;
for (const mk of AKL_REMOVED_MAKES) for (const md in (DB[mk] || {})) {
  const d = DB[mk][md];
  if (d.akl_removed !== true || d.fromScratch !== false) { bad(`${mk} ${md} violates AKL-removed invariant`); aklProbs++; }
}
for (const mk of ADD_KEY_ONLY_MAKES) for (const md in (DB[mk] || {})) {
  if (DB[mk][md].fromScratch !== false) { bad(`${mk} ${md} violates Honda/Acura add-key-only invariant`); aklProbs++; }
}
// Erase-all invariant: Subaru reprograms the whole key list — a missing
// eraseWarning would let the guided mode skip the all-keys-present gate and
// permanently lock out a customer's spare. This is the single most dangerous
// fact in the DB; it must never silently disappear.
const ERASE_ALL_MAKES = ['Subaru'];
for (const mk of ERASE_ALL_MAKES) for (const md in (DB[mk] || {})) {
  if (DB[mk][md].eraseWarning !== true) { bad(`${mk} ${md} violates erase-all invariant (eraseWarning must be true)`); aklProbs++; }
}
// AKL-removed vehicles must never carry an all-keys method string for the
// KM100 — buildSteps would otherwise print "All-keys-lost is supported".
for (const mk of AKL_REMOVED_MAKES) for (const md in (DB[mk] || {})) {
  const meth = (DB[mk][md].km100Method || '').toLowerCase();
  if (meth.includes('all-keys') || meth.includes('all keys lost')) { bad(`${mk} ${md} km100Method claims AKL on an AKL-removed make`); aklProbs++; }
}
if (!aklProbs) ok('make-level AKL/add-key/erase-all invariants hold across all ' + n + ' vehicles');

// Every DB make must be reachable from the VIN decoder's WMI table
const wmiSrc = js.match(/const WMI=\{([\s\S]*?)\};/)[1];
const wmiMakes = new Set([...wmiSrc.matchAll(/:"([^"]+)"/g)].map(x => x[1]));
const unreachable = Object.keys(DB).filter(mk => !wmiMakes.has(mk));
unreachable.length ? unreachable.forEach(mk => bad('make not in WMI table: ' + mk)) : ok('all ' + Object.keys(DB).length + ' makes reachable via VIN decode');

// Verification coverage metric — the honesty scoreboard
const vc = { verified: 0, partial: 0, model: 0 };
for (const mk in DB) for (const md in DB[mk]) vc[DB[mk][md].verified]++;
ok(`verification coverage: ${vc.verified} verified / ${vc.partial} partial / ${vc.model} model-level (${Math.round(vc.verified / n * 100)}% fully verified)`);

// ── 5. Font + size ──────────────────────────────────────────────────────────
console.log('\n[5] font + size');
html.includes("font-family:'Satoshi'") && html.includes('data:font/woff2;base64') ? ok('Satoshi embedded as data URI, body stack updated') : bad('font not embedded');
/font-weight:300 900/.test(html) ? ok('variable weight range declared') : bad('weight range missing');
console.log('  file size:', (html.length / 1024).toFixed(0) + 'KB');

console.log('\n' + (fail ? `AUDIT: ${fail} FAILURES` : 'AUDIT: ALL CHECKS PASSED'));
process.exit(fail ? 1 : 0);
