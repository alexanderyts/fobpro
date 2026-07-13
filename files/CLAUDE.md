# FobPro — Claude Code Project Guide

This file is loaded automatically at the start of every Claude Code session. It tells you (Claude) everything needed to work on this project correctly. Read it fully before editing.

## What this is

FobPro is a **single-file, mobile-first HTML web app** for a car key fob replacement business. The owner is **Alex**, an independent technician in **Mississippi (Pearl/Madison area)** who uses an **Autel KM100** programmer as the primary tool and outsources blade cuts (no key-cutting machine yet).

The app is used in the field — driveways, parking garages, often with poor or no signal. **Everything critical must work offline.** No external libraries, no build step, no framework. All HTML, CSS, and JS live inline in one `.html` file.

**Current file:** `files/fobpro_v8.html` (16 makes / 60 models). This is the canonical tracked copy; a convenience copy lives at the repo root — keep them in sync (copy after editing).

## Versioning (added v8.1.0)

- `APP_VERSION` constant + `CHANGELOG` array live at the top of the inline `<script>`. Bump the version and add a changelog entry on every meaningful change (semver-ish: data/feature = minor, fix = patch).
- The version shows in the app header and the "What's new" card on the Ref tab (rendered by `renderChangelog()`).
- Mirror releases with an annotated git tag (`git tag -a v8.1.0 -m "..."`) and an entry in `CHANGELOG.md` at the repo root.
- The filename stays `fobpro_v8.html` — versions are tracked in-app and in git, not by renaming the file.

## Hard rules (do not break these)

1. **Validate after every edit — three gates:** `node --check` on the extracted script, then `node files/audit.js` (wiring/integration/DB invariants), then `node files/tests.js` (unit/security/UX assertions — 104 as of v8.9.0; exit 1 on failure). All three must pass before an edit is done. A prior `str_replace` once silently deleted a `function updateGuide(d){` opening line and broke the whole app:
   ```bash
   node -e "const fs=require('fs');const h=fs.readFileSync('fobpro_v8.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script>/);fs.writeFileSync('/tmp/check.js',m[1]);" && node --check /tmp/check.js && echo "JS VALID"
   ```
2. **Keep it a single self-contained file** unless Alex explicitly asks to split it. No CDN links, no npm packages, no external fonts.
3. **Offline-first.** Any feature that calls the network must degrade gracefully when offline. The VIN decoder is fully offline (WMI table). The AI troubleshooter tries the Anthropic API then falls back to a local knowledge base.
4. **Technical accuracy is safety-critical.** This app guides real work on customers' vehicles. Wrong info can brick an immobilizer or strand a customer. When changing vehicle data or procedures, verify against current sources — coverage changes over time (see "Known accuracy issues" below).
5. **Commit before big changes** so edits are reversible. Suggest `git init` if not already under version control.

## Architecture

Single `.html` file with three parts: inline `<style>`, the HTML body (7 tabs), and one inline `<script>`.

### Tabs (bottom nav, `showTab(name, btn)`)
- **Lookup** — vehicle search (autocomplete + offline VIN decode), fob specs, skill badge, decision helper, customer script, data tiles, key cut/copy info, shell recommendations, guided job journey launcher.
- **Guide** — tool selector + step-by-step, plus **guided first-job mode** (one step at a time with safety gates).
- **Quote** — auto-quote from lookup, pricing tiers, location-based sales tax, invoice generator with no-refund policy.
- **Help** — AI troubleshooter (with offline fallback) + error quick reference.
- **Ref** — KM100 chip support, tool comparison, frequencies, programming notes, data-confidence scoreboard, changelog.
- **Learn** — becoming-a-locksmith path (`LEARN_PATH` phases 0–3 with progress tracking), pitfall library (`PITFALLS`), Lishi practice tracker (`LISHI_LIST`), starter stock list (`STOCK_LIST`), parts inventory with counts.
- **Jobs** — call-intake wizard (guided phone flow → job ticket with deposit guard), job pipeline (quoted → scheduled → working → done statuses editable on cards), job log + photos + confidence tracker (marks vehicles "proven" after completed jobs), parts-cost/profit economics, business stats, CSV export, backup/restore.

### Database (`const DB`)
Structure: `DB[Make][Model] = {...}`. **16 makes, 60 models:** Toyota, Honda, Ford, Chevrolet, Nissan, Hyundai, Kia, Dodge, Jeep, GMC, RAM, Subaru, Volkswagen, Lexus, Mazda, Acura. Each vehicle also carries `verified` ('verified'|'partial'|'model') and year-aware `specVariants`/`fobVariants`.

Per-vehicle fields:
`trims[], trimNotes{}, chip, freq, proto, blank, fcc, oemShell, oemButtons, oemSupplier, genericShell, genericButtons, genericSupplier, genericNote, shellNote, bladeless(bool), bladeNote, fromScratch(bool), scratchNote, keyway, bestTool, toolWhy, km100("yes"/"partial"/"no"), km100Method, km100Detail, pricing{fob_only,fob_outsource,smart,all_lost,clone}, shellCostOEM, shellCostGeneric, skill("beginner"/"intermediate"/"advanced"), obd, battery, sgw(bool), sgwNote, fobBattery, duration, maxKeys, eraseWarning(bool), gotcha, akl_removed(bool)`

Note: the DB is currently stored as a single minified JSON-style object (was machine-augmented). If you need to add fields to all vehicles, do it with a Node script that parses the DB, mutates it, and re-serializes — don't hand-edit 60 entries.

### Key data tables
- `STATE_TAX{}` — all 50 states + DC base sales-tax rates. `CITY_TAX{}` — local add-ons for common MS/LA/AL/TN cities. MS = 7%.
- `WMI{}` — VIN World Manufacturer Identifier (first 3 chars) → make. `YEAR_CODE{}` — VIN position 10 → model year.
- `ALL_TOOLS[]` — the 5 programmers for the progressive tool selector.
- `ERROR_KB[]` — troubleshooter fallback knowledge base (keyword-matched).

### Key functions
- Lookup: `doLookup()`, autocomplete `acMake/acModel/acTrim` + `pickMake/pickModel/pickTrim`, `getVehicleName()`.
- VIN: `decodeVinOffline(vin)`, `decodeVIN()`, `renderKeyCutInfo(d, vinData)`.
- Beginner-safety: `skillBadge()`, `getDecision(d)`, `renderDecision(d)`, `renderCustomerScript(d)`, `renderDataTiles(d)`.
- Guide: `updateGuide(d)`, `renderToolSelector(d)`, `getToolsForVehicle(d)`, `selectTool()`, `buildSteps(d, toolId)`, `renderGuideSteps(d, veh)`.
- Guided mode: `toggleGuided()`, `buildGuidedSteps(d)`, `renderGuidedStep()`, `guidedNext()`, `guidedBack()`.
- Checklists: `preJobChecklist(d)`, `postJobChecklist()`, `updateProg(which)`, `callout(type,icon,title,body)`.
- Tax/quote/invoice: `getTaxRate(location)`, `autoFillQuote(d)`, `buildAutoQuotePanel()`, `refreshQuote()`, `selectTier()`, `buildInvoice()`, `renderInvoice()`, `copyInvoice()`.
- Troubleshooter: `runTroubleshoot()` (Anthropic API → `localTroubleshoot()` fallback), `quickTs()`, `renderErrorRef()`.
- Jobs/confidence: `saveJob()`, `clearJob()`, `renderJobs()`, `normalizeVehicle()`, `getProvenCount()`.

### State variables
`currentVehicle, selectedTier('standard'), invoiceData, selectedTool('km100'), jobs[], provenVehicles{}, guidedActive, guidedIndex, guidedSteps[], tsHistory[], window._lastVin`

## Design system

Modern token-based CSS in `:root`. Navy `#15172b`, accent blue `#5b8def`, semantic green/amber/red/teal, purple for customer-script cards. Radius 14px, layered shadows, frosted-glass bottom nav. Max width 440px, mobile-first. System font stack only.

Class conventions: `.fi` inputs, `.btn`/`.btn-primary`/`.btn-green`/`.btn-outline` buttons, `.ban.{g,y,r,b,n}` banners, `.callout.{danger,caution,info,success}`, `.skill-badge.{beginner,intermediate,advanced}`, `.data-tile`, `.decision.{go,caution,stop}`, `.script-card`, `.guided-step`, `.tool-option`, `.shb.{oem,gen}` shells, `.ffs.{yes,no}` from-scratch, `.ca.{can,cant}` cut assessment.

## Known accuracy issues / domain facts to preserve

- **CRITICAL — KM100 all-keys-lost removed in North America (late 2024).** Autel removed AKL for **Toyota, Lexus, GM (Chevrolet/GMC), Ford, Mazda, Nissan, and Chrysler/Dodge/Jeep/RAM** in N. America (Toyota legal/licensing pressure). These makes now have `fromScratch:false` and `akl_removed:true`. **Add-key still works** (with an existing key); zero-key jobs on these makes must be referred out or done with another tool (Xhorse/Lonsdor/SmartPro/XTool). Do NOT revert these to claiming AKL works. Hyundai, Kia, Subaru, VW were NOT affected. The removal is permanent (no rollback once the tool has been online).
- **2025+ Toyota/Lexus (BA/B6-type immobilizers): NO aftermarket AKL exists from any tool as of July 2026.** Lonsdor's July 2026 K518 update added add-key only, and it requires the FP30 30-pin cable. Zero-key 2025+ Toyotas are dealer-only. (Verified via Lonsdor/OBDII365 update notes, July 2026.)
- **Ford 2015+ uses ID49 Hitag Pro 128-bit chips (PCF7939FA), NOT DST80.** DST80/4D63 was the 2011–14 generation. H128-PT/HU101 blades pair with ID49.
- **Hyundai/Kia 2011–2021 base turn-key trims: many have NO immobilizer** — cut-only key, zero programming (the theft-wave cars). The 2023 anti-theft software update adds an ignition kill: car must be unlocked with the remote before it will crank, so a cut-only key alone won't start an updated car.
- **FCC IDs are generation-specific** — DB `fcc` fields now carry year ranges (e.g. "HYQ14FBA (2012-17) / HYQ14FBC (2018-24)"). GQ4-53T is RAM-fobik-only; Dodge/Jeep smart keys are M3N-40821302; 2019+ Ram DT is OHT-4882056 (4A chip); 2022+ GM trucks / 2021+ GM SUVs are YG0G21TB2 (ID49); 2019+ Nissan is KR5TXN1 (4A, 433 MHz); 2022+ Honda is KR5TP-4 (4A).
- **"SGW" flags:** FCA-style secure gateway = 2018+ Stellantis; Ford's gateway = 2020+ Explorer/Escape, 2021+ F-150. GM has no SGW — its barrier is CAN FD (2019+ T1 trucks, 2021+ full-size SUVs); the MaxiVCI V200 supports CAN FD.
- **Honda** = add-key only on KM100 regardless (needs an existing working key for authentication; AKL needs IM608). `fromScratch:false`.
- **Subaru** = erases ALL keys during programming; every existing key must be present or it's permanently locked out. `eraseWarning:true`. Max 4 keys.
- **VW MQB** = KM100 only partial; recommend IM508S/VVDI. All keys must be present.
- **Battery voltage** = 12.4V minimum (12.6V preferred on trucks). Below that risks immobilizer corruption mid-write. This is the #1 cause of failed/bricked jobs — keep it as step 1 everywhere.
- **Secure Gateway Module (SGW)** = 2018+ FCA/Ford/GM. Flagged per-vehicle via `sgw`/`sgwNote`.
- Tax: Mississippi locksmith services ARE taxable at 7%.

## Known limitations (candidate future work)

- ~~No persistent storage~~ **Fixed in v8.1.0:** `jobs[]`, `provenVehicles{}`, invoice business info, and the troubleshooter API key persist via `localStorage` (`persistState()`/`loadState()`; keys `fobpro_*`). Per-device only — no sync/backup yet (export feature is a candidate).
- **AI troubleshooter requires the user's Anthropic API key** (Help tab → saved to localStorage; sent via `x-api-key` + `anthropic-dangerous-direct-browser-access` headers, model `claude-opus-4-8`). No key or no signal → offline `ERROR_KB` fallback, which is the designed behavior.
- **Single-file constraint** is by choice (chat-interface artifact origin). Once in Claude Code, splitting the DB into its own file is reasonable if Alex wants it.
- VIN decode resolves make + year reliably; model isn't standardized in the VIN, so the user still picks the model. Bitting codes require AllKeys Plus / dealer (proprietary — can't be embedded).
- Database coverage gaps: Lexus/Mazda/Acura added in v8.6; still no Mercedes/BMW/Infiniti/Mitsubishi/Buick/Cadillac; 18 vehicles are `verified:'partial'` and 1 is `'model'` (Prius) — re-verification queue documented in the Ref-tab scoreboard. Blade/blank data was fully verified against the 2025 Ilco guide (v8.13.0; the guide PDF lives in `files/key info/`); FCC data for partials remains the open queue.

## Tone for Alex-facing copy

Confident, warm, direct, Southern, succinct, event/action-focused. Not salesy. When declining/refusing within the app (e.g. "refer this out"), be plain and practical, not alarmist.

## Version history

v1 basic lookup/log → v2 OEM shells → v3 KM100 compat + guide → v4 generic shells, tool rec, cut assessment, quote/invoice → v5 autocomplete + auto-quote → v6 DB to 13 makes/42 models → v7 offline VIN decoder, location tax, progressive tool selection, AI troubleshooter, bottom-nav redesign → **v8 (current)** beginner-safety suite (guided mode, skill ratings, decision helper, customer script, new data tiles, confidence tracker), modern UI refresh, and the AKL-removal accuracy correction.

## How to resume

1. Confirm `fobpro_v8.html` is in the working directory.
2. For any edit: make the change, run the `node --check` validation above, then if possible open the file in the preview panel / a browser to eyeball it.
3. Keep changes reversible (commit first).
4. When adding vehicles or fields, script the DB mutation in Node rather than hand-editing.
