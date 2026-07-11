# FobPro Changelog

Versions are also shown in-app (Ref tab → "What's new") and mirrored as git tags.

## v8.9.0 — 2026-07-11

### The phone call becomes part of the app (owner-approved bundles 1–4)
Fresh research sweep (NASTF requirements, roadside platforms, the fixMyKM gray-market unlock, digital-key/UWB trajectory) plus a workflow review that found the app covered the driveway but not the phone call — where jobs are actually won or lost.

- **Call-intake wizard** (Jobs tab, plus a shortcut on Lookup): guided 5-step phone flow — callback number first (anti-scam gate), vehicle pick with generation awareness, the four triage questions (keys / push-button / fob source / aftermarket alarm), an instant verdict with quote range and a say-it-like-this script, truck-stock check against inventory, and a **deposit guard** before any part gets ordered. All-keys-lost calls the tools can't do get a refer-out script and log as referred — the refused-work log is the tool-ladder business case.
- **Job pipeline:** new `quoted` and `scheduled` statuses; open job cards carry their own status/price/parts-cost controls and a "▶ Lookup" button that loads the ticket's vehicle straight into the lookup. A ticket flows call → booked → done without re-entering anything.
- **Job economics:** parts-cost + deposit fields on every job; Business health now shows profit, parts spend, margin % (against the 60-75% healthy band for mobile key work), and open-pipeline count; per-job profit chip on completed cards; CSV export carries the new columns.
- **Business path (researched Jul 2026):** NASTF VSP milestone expanded to the concrete checklist — $435/2yr, $1M/$500K general-liability certificate emailed by your agent, FEIN, two references, and **no locksmith license needed in Mississippi** (the state doesn't issue one). New Phase-2 step: roadside platforms (AAA contractor / HONK / Urgently / Agero) as paid Lishi practice and early lead flow. Bitting-code guidance now names the VSP path alongside the dealer.
- **Tool protection:** two new pitfalls — *updates can DELETE capability* (the 2024 AKL removals shipped as routine updates; read release notes + user groups first, never update before booked work) and *gray-market "AKL restore" unlocks are a trap* (fixMyKM et al.: warranty, insurance, and courtroom exposure; capability comes from the tool ladder, not hacks). Update-discipline note added to the Ref-tab tool card.
- **2026+ horizon card (Ref tab):** digital-key/UWB landscape — Tesla/Rivian/Lucid are closed to the aftermarket, phone-as-key enrollment is an owner-app task (decline warmly, script provided), and OBD + NASTF credentials is the future-proof lane.
- Test suite grew 71 → **104 assertions** (intake state machine, pipeline proven-credit idempotence, deposit guard, stock matching, economics math, content invariants, static wiring).

## v8.8.0 — 2026-07-10

### Engineering audit + hardening (owner-approved fix bundles A–D)
A 56-test suite (`files/tests.js`) was built across unit/logic/workflow/security/UX and surfaced 11 findings; all were approved and fixed, and every finding is now a permanent test assertion (71 tests total, all passing).

- **Security:** CSV formula-injection neutralized (leading `=`/`+`/`-`/`@` quoted per OWASP); VIN input strictly validated to `[A-HJ-NPR-Z0-9]{17}` (markup injection closed); job photos render only `data:image/` sources and the viewer refuses anything else (tampered-backup safety); backups verified to exclude the API key.
- **Pricing/logic:** trim-aware service inference — prox trims (e.g. Camry XSE) now quote smart-key pricing in the journey AND auto-quote (was underquoting $130 vs $185); out-of-range years fall back to the *nearest* generation instead of the newest (a 2005 Camry now shows 2012-gen data, not 2025); "Jackson,MS" comma variants find the city tax add-on; Lexus/Acura/Mazda used-fob rules added.
- **Field usability:** all inputs 16px (stops iOS zoom-on-focus mid-job); +/−/✕ touch targets enlarged to ≥44px (glove-friendly); `--text3`/`--text4` brightened to pass WCAG AA 4.5:1 (sunlight readability).
- **Accessibility:** aria-labels on all 10 icon-led buttons; photo overlay is a labeled dialog dismissible with Escape.

## v8.7.0 — 2026-07-10

### Full-database accuracy audit
- Re-verified the suspect FCC set inherited from the original build. **Confirmed and fixed errors:** Elantra (phantom "OST-T111" → OSLOKA-360T 2011-16 / OSLOKA-423T 2017-20, with the 315→433 MHz frequency split), Santa Fe (listed fob was actually a **Kona** part → SY5DMFNA04 for 2013-18 prox), Optima (→ NYODD4TX1306 / SY5JFRGE04), Sorento (→ TQ8-FOB-4F06 / SY5MQ4FGE05), Highlander (unconfirmable "HYQ14FBW" → HYQ14FBA 2014-19 / HYQ14FBC 2020-24, with new specVariants). Tacoma/Tundra prox confirmed on HYQ14FBA; 2022+ Tundra flagged as new-generation BA immobilizer (no aftermarket AKL).
- **Verified correct as listed:** Tucson (TQ8-RKE-4F25, flip 2016-21) and Sportage (TQ8-FOB-4F08, 2013-21).
- **Honestly downgraded:** Prius, Kia Soul, and Odyssey — their IDs could not be independently confirmed, so they now instruct "verify on fob" instead of presenting unverified data as fact.

### Honest-confidence system (anti-overconfidence)
- Every vehicle carries a `verified` level — **41 verified / 17 partial / 2 model-level** — enforced as a required field by the audit.
- Lookup results and the journey's parts step show the badge: green "data verified Jul 2026", amber "partially verified — confirm FCC on fob", red "model-level — verify every part on the fob".
- Ref tab gains a **Data confidence scoreboard**: counts, the re-verification queue (partial/model vehicles listed by name), and the standing rule: *the FCC printed on the customer's fob outranks this database; coverage facts older than ~6 months deserve a fresh check.*
- Guide headers now state provenance: steps cross-checked against official tool manuals (Jul 2026).
- Audit prints the verification-coverage metric each run (currently 68% fully verified) — the number to push up over time, honestly.

## v8.6.0 — 2026-07-10

### Coverage expansion (12 vehicles, 3 new makes — verified July 2026)
- **Lexus RX/NX** (HYQ14FBB G-board 2016-19 / HYQ14FLB 2020-22; 2023+ RX = BA immobilizer, no aftermarket AKL), **Mazda3/CX-5** (WAZSKE13D01/D02, ID49, CR2025 battery), **Acura MDX/RDX** (KR5V1X, 313.8 MHz, Driver-1/Driver-2 memory fobs are different parts; Honda add-key-only rules), **Chevy Traverse** (HYQ4EA 433) & **Colorado** (M3N32337100 flip, shared with Canyon), **Nissan Frontier** (2022+ KR5TXN7 shared with Murano/Titan) & **Murano** (three fob generations), **Toyota 4Runner** (HYQ12BBY G-chip covers 2010-19), **Ford Edge** (M3N-A2C31243300 902 MHz, cross-stocks with Fusion/Explorer/Mustang).
- All entries carry generation-split specVariants where verified, correct per-make AKL/add-key rules, pricing, and Lexus/Acura premium positioning. New WMI entries (JTH/JTJ/2T2, JM1/JM3/3MZ, 19U/5J8/2HN…) so VIN decode recognizes the new makes.

### Ownership photo capture (Jobs tab)
- Camera/file capture on the job form; compressed to ~40-90KB (max 900px, JPEG); max 3 per job; thumbnails on job cards with full-screen viewer; photos ride inside job records so backup/restore carries them; CSV export excludes them; storage-full guard with recovery guidance.

### Lishi practice tracker (Learn tab)
- 12 keyways matched to the database's vehicles (HU101, TOY43/48, HON66, NSN14, B111, HU100, HY22, KK12, CY24/Y159, MAZ24R, SIP22) with difficulty ratings, per-keyway rep counters, and the proficiency ladder: 25 clean bench reps = field-ready. Genuine-Lishi-only warning cross-links the cheap-tools pitfall.

### Cross-step safeguards (how the steps affect each other)
- New audit invariants: every model under Toyota/Lexus/GM/Ford/Mazda/Nissan/Stellantis must carry `akl_removed:true` + `fromScratch:false`; Honda/Acura must be add-key-only; every DB make must be reachable from the VIN decoder's WMI table. New vehicles flow through the same journey/verdict/quote logic automatically. Audit suite now 24 runtime tests, all passing.

## v8.5.0 — 2026-07-10

### Pitfalls & field protocols (Learn tab)
- 8 verified failure modes with prevention protocols, each documented from real incidents rather than theory: the organized locksmith-scam networks (FTC: 4,500+ complaints in 2024 — never become a dispatch sub, differentiate loudly), bricked modules (stay in lane, one-retry rule), the stolen-car setup (ownership gate has no exceptions), night-call personal safety (callback confirmation, live location sharing, walk-away rule), underquoting, cheap tools, burnout (after-hours = premium, not obligation), and dead inventory. Acknowledgment checkboxes persist.
- Night-call safety protocol also surfaces in the journey's phone-triage step.

### Truck inventory manager (Jobs tab)
- On-hand counts with par levels; +/− adjusters; below-par items flag red as this week's order; add anything by name or FCC ID. Enforces the rule: stock follows the Jobs log, never the catalog.

### Business health dashboard (Jobs tab)
- Revenue (completed), average ticket, jobs logged, and callback rate scored against the 1-in-20 quality threshold (warns when exceeded — usually skipped post-job testing). Most-seen vehicles listed so stocking and training follow reality.

### Docs & tooling
- Playbook Part 7: pitfalls with sources. Backup/restore now includes inventory + pitfall progress. Audit suite extended to 19 runtime tests (all passing).

## v8.4.0 — 2026-07-10

### New job types
- **Vehicle lockout** ($95 default, market $75–150) and **fob battery swap** ($45 default, market $35–55) in the quote calculator, job log, and market guidance. Lockout kit (air wedge + long-reach) added to the van-stock checklist with technique cautions (frameless glass, deadlocked Euro cars).

### Backup & export (Jobs tab)
- Jobs → CSV (Excel/Sheets-ready, proper quoting) for taxes and restock reviews.
- Full JSON backup of everything on the device (jobs, proven vehicles, learn/stock progress, business info) + one-tap restore.

### Warranty & callbacks
- New job status "Callback / warranty return" with red indicator.
- Invoice policy now leads with the industry-standard 30-day workmanship warranty (parts per manufacturer; customer-supplied parts labor-only).

### Typeface
- Standardized on **Satoshi** (Fontshare FF EULA), embedded as a base64 data URI (~57KB) so the offline-first rule holds. Variable weight 300–900; monospace kept for VIN entry.

### Business-start content (Playbook)
- Mississippi setup verified 2026: $50 LLC Certificate of Formation, free annual report, $25 DBA, free sales-tax permit via TAP, no locksmith license in MS; insurance ladder.
- Lockout service technique + pricing; battery-swap upsell flow; warranty/callback policy norms with a 1-in-20 callback quality threshold.

### Tooling
- `files/audit.js` — repeatable audit harness: element/handler wiring checks, 15-test runtime smoke suite, DB integrity, font embed. Run `node files/audit.js` after any edit.

### UI sweep
- 7-tab bottom nav fitted (ellipsis guard, tightened sizing); callback status dot style; all 81 referenced element IDs and 45 event handlers verified wired.

## v8.3.0 — 2026-07-10

### Sourcing & inventory (Ref tab + Playbook Part 6)
- **Four-rung sourcing ladder**: universal programmable remotes (Autel IKEY / Xhorse XS-XE-XN, one SKU covers dozens of models, XS supports unlimited regeneration) → model-specific quality aftermarket (KeylessOption/Keyless2Go/Dorman via distributors, never marketplace) → refurbished OEM (bench-tested original boards) → new OEM (Strattec via distributor = true OEM domestic; dealer for 2025+ Toyota).
- **Vendor short-list verified active July 2026**: UHS Hardware (primary; van bundles), American Key Supply, Locksmith Keyless (FCC-ID search incl. 2024-26 models), Transponder Island, Best Key Supply, Key4/Royal/ABKeys/MK3. Account strategy: one primary wholesale account + one backup, weekly batch orders.
- **Van-stock starter checklist** (persistent): 12 items (~$400-600) matched to the DB's highest-volume vehicles, with the restock rule — Jobs log drives reorders, par 2 for 60-day movers, reorder on opening the last one. Never stock used OEM prox fobs.

## v8.2.0 — 2026-07-10

### Guided Job Journey (new)
- Start-to-finish contextual flow on the Lookup tab: identify → phone triage (keys count, who supplies the fob, alarm, ownership docs) → verdict & price → parts → on-site → wrap-up. One step at a time instead of every card at once.
- Pulls from the same DB and decision logic as the classic view (getDecision / getSpecVariant / fobTriageText), so the journey cannot contradict the reference data. Classic full view remains available; journey is opt-in per job.
- Zero-keys on AKL-removed makes routes to a refer-out ending with a customer script.
- On-site step surfaces the per-vehicle OBD port location, battery location, and expected duration.

### Learn tab (new)
- "Becoming an automotive locksmith" roadmap: 4 phases, 18 steps from $0 orientation to CAL certification and NASTF VSP registration. Compiled from ALOA course listings, American Key Supply academy schedules, Penn Foster program data, Locksmith Ledger training calendars, and practitioner-community advice (July 2026). Progress persists per device.

### Gap features from the v8.1 audit
- **Year-aware electronics (specVariants):** 23 models carry verified generation splits; entering the model year locks chip/frequency/FCC to the exact generation with a confidence banner. Falls back to annotated model-level data elsewhere.
- **Ownership verification:** first question in the customer script, first required item on the pre-job checklist, a hard legal gate in guided mode, and a recorded verification line (with document notes) on the invoice.
- **Customer-supplied fob triage:** per-make used-fob rules (most used OEM smart/prox fobs are VIN-locked to the donor; Ford/GM friendlier; Hyundai/Kia one-time-pair), new-fob policy language, and a test-read-first workflow — in the lookup card, phone script, and journey.

### Part-verification procedure (from the KM100 official manual)
- New guide step and journey callout: FCC label check → Reading/Cloning → Transponder Reading (chip in hand) → Frequency Detection (remote MHz) → Ignition Coil Detection (reads the IMMO protocol and expected transponder type from the car, collector within 4 in/10 cm).
- PLAYBOOK.md Part 2 expanded: finding the OBD port, verifying by FCC ID, and the three programmer checks.

## v8.1.0 — 2026-07-10

### Data accuracy (verified against July 2026 sources)
- **Ford 2015+**: chip corrected to ID49 Hitag Pro 128-bit (was wrongly listed as DST80, the 2011–14 chip). Escape 2020+ corrected to HU101 keyway. Real FCC IDs replace Strattec part numbers in FCC fields.
- **Stellantis**: Charger/Challenger/Durango/Grand Cherokee/Cherokee corrected to the M3N-40821302 smart key (GQ4-53T is the RAM fobik only). RAM 1500/2500 now distinguishes Classic (fobik GQ4-53T) vs DT (prox OHT-4882056, 4A chip) — both sold 2019–2024.
- **GM**: removed the self-contradictory "ID46 (Megamos 48)" label → ID46E (Philips Hitag 2); added 2022+ Silverado/Sierra and 2021+ Tahoe/Yukon YG0G21TB2 prox keys (ID49); replaced the incorrect SGW flag with the real barrier (CAN FD on 2019+ trucks / 2021+ SUVs).
- **Toyota**: FCC IDs split by generation (HYQ14FBA 2012-17 / HYQ14FBC 2018-24, etc.); Corolla blank corrected TR47 → TOY44H-PT; added the 2025+ BA/B6 immobilizer reality — no aftermarket AKL exists yet, add-key needs Lonsdor July-2026 update + FP30 cable.
- **Honda**: generation split added — 2022+ Civic / 2023+ CR-V, HR-V, Pilot, Accord use KR5TP-4 (4A chip).
- **Nissan**: generation-split chips/FCC/frequency (2019+ = KR5TXN1, 4A, 433.92 MHz; Rogue/Pathfinder corrected).
- **Hyundai/Kia**: Sonata FCC corrected (SY5DMFNA04 was a Santa Fe part → CQOFD00120); "ID47 (Kia G)" mislabel fixed to Hitag 3; added the no-immobilizer note for 2011–2021 base turn-key trims + 2023 anti-theft-update behavior.
- **VW**: chip label corrected to Megamos AES (MQB48); real FCC IDs (NBGFS12A01 / KR5FS14-T).
- Error KB and tool-selector text updated for the 2025+ Toyota situation and permanent KM100 AKL removal.

### Features
- **Persistent storage**: job log, proven-vehicle tracker, invoice business info survive reloads (localStorage, per device).
- **AI troubleshooter fixed**: was silently failing on every request (no auth headers). Now takes the user's Anthropic API key (Help tab), sends correct browser headers, uses a current model, and keeps the offline fallback.
- **Versioning**: APP_VERSION + in-app changelog (Ref tab), version badge in header, git tags.
- **VIN decoder**: validates the ISO 3779 check digit and warns on typos; fixed corrupted WMI entries ("1GicarpetC", "KNd", "3C4J"); added missing Toyota/GMC WMIs; removed dead fallback code.

### Fixes
- Tax lookup: "Kansas City Missouri"-style inputs no longer match the wrong state; "City ST" (no comma) and bare "MS" now work.
- User-entered text (names, notes, locations) is HTML-escaped in job cards, invoices, and troubleshooter history.
- Copy buttons no longer break on part numbers containing quotes.
- `getProvenCount` no longer over-counts when the model field is empty.

### Docs
- New `files/PLAYBOOK.md` — the 2026 automotive locksmith playbook (trade fundamentals, universal job flow, tool landscape, ownership verification, MS business practices).
- `files/CLAUDE.md` updated with new verified domain facts and the versioning convention.

## v8.0.0 — 2026-07 (pre-existing)
- Beginner-safety suite: guided first-job mode, skill ratings, decision helper, customer script, data tiles, confidence tracker; modern UI refresh; AKL-removal accuracy correction; copy-to-clipboard for parts; responsive layout; cross-checks against official tool manuals and the 2025 Ilco reference guide.
