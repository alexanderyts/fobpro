# FobPro Changelog

Versions are also shown in-app (Ref tab → "What's new") and mirrored as git tags.

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
