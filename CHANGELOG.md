# FobPro Changelog

Versions are also shown in-app (Ref tab → "What's new") and mirrored as git tags.

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
