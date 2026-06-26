# FobPro — Claude Code Project Guide

This file is loaded automatically at the start of every Claude Code session. It tells you (Claude) everything needed to work on this project correctly. Read it fully before editing.

## What this is

FobPro is a **single-file, mobile-first HTML web app** for a car key fob replacement business. The owner is **Alex**, an independent technician in **Mississippi (Pearl/Madison area)** who uses an **Autel KM100** programmer as the primary tool and outsources blade cuts (no key-cutting machine yet).

The app is used in the field — driveways, parking garages, often with poor or no signal. **Everything critical must work offline.** No external libraries, no build step, no framework. All HTML, CSS, and JS live inline in one `.html` file.

**Current file:** `fobpro_v8.html` (~204KB, 48 vehicles, 54 JS functions). This is the canonical latest version.

## Hard rules (do not break these)

1. **Validate JS after every edit.** Extract the script and run `node --check`. A prior `str_replace` once silently deleted a `function updateGuide(d){` opening line and broke the whole app. Always verify before considering an edit done:
   ```bash
   node -e "const fs=require('fs');const h=fs.readFileSync('fobpro_v8.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script>/);fs.writeFileSync('/tmp/check.js',m[1]);" && node --check /tmp/check.js && echo "JS VALID"
   ```
2. **Keep it a single self-contained file** unless Alex explicitly asks to split it. No CDN links, no npm packages, no external fonts.
3. **Offline-first.** Any feature that calls the network must degrade gracefully when offline. The VIN decoder is fully offline (WMI table). The AI troubleshooter tries the Anthropic API then falls back to a local knowledge base.
4. **Technical accuracy is safety-critical.** This app guides real work on customers' vehicles. Wrong info can brick an immobilizer or strand a customer. When changing vehicle data or procedures, verify against current sources — coverage changes over time (see "Known accuracy issues" below).
5. **Commit before big changes** so edits are reversible. Suggest `git init` if not already under version control.

## Architecture

Single `.html` file with three parts: inline `<style>`, the HTML body (6 tabs), and one inline `<script>`.

### Tabs (bottom nav, `showTab(name, btn)`)
- **Lookup** — vehicle search (autocomplete + offline VIN decode), fob specs, skill badge, decision helper, customer script, data tiles, key cut/copy info, shell recommendations.
- **Guide** — tool selector + step-by-step, plus **guided first-job mode** (one step at a time with safety gates).
- **Quote** — auto-quote from lookup, pricing tiers, location-based sales tax, invoice generator with no-refund policy.
- **Help** — AI troubleshooter (with offline fallback) + error quick reference.
- **Ref** — KM100 chip support, tool comparison, frequencies, programming notes.
- **Jobs** — job log + confidence tracker (marks vehicles "proven" after completed jobs).

### Database (`const DB`)
Structure: `DB[Make][Model] = {...}`. **13 makes, 48 models:** Toyota, Honda, Ford, Chevrolet, Nissan, Hyundai, Kia, Dodge, Jeep, GMC, RAM, Subaru, Volkswagen.

Per-vehicle fields:
`trims[], trimNotes{}, chip, freq, proto, blank, fcc, oemShell, oemButtons, oemSupplier, genericShell, genericButtons, genericSupplier, genericNote, shellNote, bladeless(bool), bladeNote, fromScratch(bool), scratchNote, keyway, bestTool, toolWhy, km100("yes"/"partial"/"no"), km100Method, km100Detail, pricing{fob_only,fob_outsource,smart,all_lost,clone}, shellCostOEM, shellCostGeneric, skill("beginner"/"intermediate"/"advanced"), obd, battery, sgw(bool), sgwNote, fobBattery, duration, maxKeys, eraseWarning(bool), gotcha, akl_removed(bool)`

Note: the DB is currently stored as a single minified JSON-style object (was machine-augmented). If you need to add fields to all vehicles, do it with a Node script that parses the DB, mutates it, and re-serializes — don't hand-edit 48 entries.

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

- **CRITICAL — KM100 all-keys-lost removed in North America (late 2024).** Autel removed AKL for **Toyota, Lexus, GM (Chevrolet/GMC), Ford, Mazda, Nissan, and Chrysler/Dodge/Jeep/RAM** in N. America (Toyota legal/licensing pressure). These makes now have `fromScratch:false` and `akl_removed:true`. **Add-key still works** (with an existing key); zero-key jobs on these makes must be referred out or done with another tool (Xhorse/Lonsdor/SmartPro/XTool). Do NOT revert these to claiming AKL works. Hyundai, Kia, Subaru, VW were NOT affected.
- **Honda** = add-key only on KM100 regardless (needs an existing working key for authentication; AKL needs IM608). `fromScratch:false`.
- **Subaru** = erases ALL keys during programming; every existing key must be present or it's permanently locked out. `eraseWarning:true`. Max 4 keys.
- **VW MQB** = KM100 only partial; recommend IM508S/VVDI. All keys must be present.
- **Battery voltage** = 12.4V minimum (12.6V preferred on trucks). Below that risks immobilizer corruption mid-write. This is the #1 cause of failed/bricked jobs — keep it as step 1 everywhere.
- **Secure Gateway Module (SGW)** = 2018+ FCA/Ford/GM. Flagged per-vehicle via `sgw`/`sgwNote`.
- Tax: Mississippi locksmith services ARE taxable at 7%.

## Known limitations (candidate future work)

- **No persistent storage.** `jobs[]` and `provenVehicles{}` reset on reload. Top requested upgrade. In Claude Code this becomes feasible — could use a real storage layer or split into multiple files with a small backend.
- **Single-file constraint** is by choice (chat-interface artifact origin). Once in Claude Code, splitting the DB into its own file is reasonable if Alex wants it.
- VIN decode resolves make + year reliably; model isn't standardized in the VIN, so the user still picks the model. Bitting codes require AllKeys Plus / dealer (proprietary — can't be embedded).
- Database coverage gaps: no Lexus/Acura/Mazda/Subaru-beyond-3/Mercedes/BMW/Infiniti yet; missing some high-volume models (Explorer variants, Traverse, Colorado, Frontier, Murano, etc.).

## Tone for Alex-facing copy

Confident, warm, direct, Southern, succinct, event/action-focused. Not salesy. When declining/refusing within the app (e.g. "refer this out"), be plain and practical, not alarmist.

## Version history

v1 basic lookup/log → v2 OEM shells → v3 KM100 compat + guide → v4 generic shells, tool rec, cut assessment, quote/invoice → v5 autocomplete + auto-quote → v6 DB to 13 makes/42 models → v7 offline VIN decoder, location tax, progressive tool selection, AI troubleshooter, bottom-nav redesign → **v8 (current)** beginner-safety suite (guided mode, skill ratings, decision helper, customer script, new data tiles, confidence tracker), modern UI refresh, and the AKL-removal accuracy correction.

## How to resume

1. Confirm `fobpro_v8.html` is in the working directory.
2. For any edit: make the change, run the `node --check` validation above, then if possible open the file in the preview panel / a browser to eyeball it.
3. Keep changes reversible (commit first).
4. When adding vehicles or fields, script the DB mutation in Node rather than hand-editing.
