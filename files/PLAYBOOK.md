# The FobPro Playbook — Automotive Locksmithing in 2026

Written for someone who has never held a key fob before, and kept current as of **July 2026**. This is the companion document to the FobPro app: the app tells you *what* to do on a specific car; this tells you *why*, and how to run the work as a business.

---

## Part 1 — What this trade actually is

Every modern car key has up to three separate systems in one piece of plastic:

1. **The mechanical blade** — a metal key that turns locks. On proximity ("smart") keys it's hidden inside as an emergency insert. Cutting it is machining, not electronics.
2. **The transponder chip** — a tiny passive chip inside the fob. When you turn the ignition (or push start), the car's **immobilizer** radios the chip a challenge; if the chip doesn't answer correctly the engine starts and dies in ~2 seconds, or never cranks. **Programming a key = teaching the car's immobilizer to accept this chip.**
3. **The remote (RKE)** — the lock/unlock/panic buttons, transmitting at 315 or 433.92 MHz in North America (some Ford prox fobs use 902 MHz). Often synced in a separate step from the chip.

A "fob replacement" job is: identify the right part → source it → cut the blade (if any) → program the chip → sync the remote → test everything. That's it. Everything else in this playbook is detail on those six steps.

### The vocabulary you must know

| Term | Meaning |
|---|---|
| **Add-key** | Customer has ≥1 working key. You add a spare. Easiest, safest job. |
| **All-keys-lost (AKL)** | Zero working keys. The immobilizer must be reset/bypassed. Harder, pricier, riskier — and on several makes no longer possible with budget tools (see Part 4). |
| **Clone** | Copy an existing key's chip onto a new one. The car can't tell them apart. No OBD programming needed; only works on cloneable chip types. |
| **OBD programming** | Plugging a programmer into the OBD-II port (under the dash) and commanding the immobilizer to learn a key. |
| **FCC ID** | The ID printed on the fob's label (under the battery cover). The single most reliable way to buy the correct replacement. |
| **Bitting code** | The factory cut pattern for the blade, retrievable from the VIN via AllKeys Plus or a dealer. |
| **Lishi tool** | A pick/decoder that reads a lock's cuts directly — how you originate a blade when there's no code. |
| **PIN / security code** | A code some makes require before the immobilizer accepts commands. Good tools calculate it automatically; never brute-force it. |
| **SGW (Secure Gateway)** | A module on 2018+ Stellantis and 2020/21+ Ford that blocks OBD write commands unless the tool is authorized or a bypass cable is used. |
| **CAN FD** | A faster CAN bus on 2019+ GM trucks / 2021+ GM SUVs. Your VCI must support it (the KM100's MaxiVCI V200 does). |

---

## Part 2 — The universal job, step by step

This is the flow for **every** job. The FobPro Guide tab renders a vehicle-specific version of it; this is the reasoning behind each step.

### Before you roll (on the phone)
1. **Year / make / model / trim** — and whether it's push-button start or a turn key. Get the VIN if they can read it (windshield corner or door jamb).
2. **"How many working keys do you have, and are they all with the car?"** — decides add-key vs AKL, and whether the job is even possible with your tools.
3. **"Any aftermarket alarm or remote start?"** — Viper/Compustar installs block programming until disarmed.
4. **Ownership check (see Part 5)** — tell them what documents you'll need to see. Do this on the phone so there's no confrontation on site.
5. **Quote a range, not a promise** — final price after you verify the vehicle in person. FobPro's Quote tab gives you the numbers.

### On site — the safety gates (in order, no exceptions)
1. **Battery voltage ≥ 12.4 V** (12.6 preferred on trucks). Low voltage mid-write is the #1 cause of bricked immobilizers. Hook up a jump pack if borderline and keep it on for the whole job.
2. **All keys physically present** if there's any chance the procedure erases the key list (Subaru always; many AKL procedures on other makes). A key left at home gets permanently locked out.
3. **OBD connector firmly seated** — wiggle-test it. A dropped connection mid-write does the same damage as low voltage.
4. **Verify the vehicle on the tool screen against the door sticker** before running anything. Wrong selection = wrong procedure.

### The work

**Finding the OBD port.** It's legally required to be near the steering wheel on every 1996+ car sold in the US. In practice: kneel at the driver's door, look **under the dash left of the steering column** (most cars), then right of the column, then behind a small flip-down panel or above the pedals (some Chrysler/RAM hide it behind a cover). It's a 16-pin trapezoid female connector. FobPro stores the exact spot per vehicle (data tiles + the journey's on-site step), so check the app before you crawl.

**Verifying the part (the FCC ID check).** Every remote sold in the US carries an FCC ID on a printed label — open the fob's battery cover (small flathead in the seam) and read it. It must match what FobPro's lookup shows for the year/model. This one label beats guessing from the shape, and when ordering online, search by FCC ID, not by "2019 Camry key".

**Checking chip & frequency — yes, this is where the programmer comes in.** The KM100 has three built-in checks (all from the home screen, per the official manual):
- **Reading/Cloning → Transponder Reading** — set the key in the tool's key slot; it reads and displays the chip type/ID inside. Confirms what you *bought*.
- **Transponder Function → Frequency Detection** — hold the fob near the tool and press a button; it displays the transmit frequency in MHz. Confirms the *remote* side.
- **Ignition Coil Detection** — hold the tool's low-frequency collector within 4 in / 10 cm of the car's ignition coil (cycle the ignition if no signal); it reads the vehicle's IMMO protocol and expected transponder type **straight from the car**. Confirms what the *car wants* — and it's also how you test whether a base-trim Hyundai/Kia has no immobilizer at all.

When all three line up — label matches lookup, chip read matches, car's expected type matches — you program with confidence.

5. **Verify the part** — run the checks above before touching the car. Frequency and chip must match; a 433 MHz remote will never pair to a 315 MHz car even if the shell is identical.
6. **Handle the blade** — transfer the old blade into the new shell when you can (no cutting, no code needed). Otherwise: pull the bitting code by VIN (AllKeys Plus/dealer), decode the door lock with a Lishi, or outsource the cut.
7. **Program the chip** — follow the tool's guided flow (KM100: IMMO → Hot Function → Add Key (guided)). If a PIN calculation fails, **stop** — repeated attempts trigger lockouts. Refer out rather than retry blind.
8. **Sync the remote** — Remote Control Learning, press buttons when prompted.
9. **Test everything before taking payment** — new fob: lock/unlock/panic/trunk, engine starts *and stays running*. Then **every original key** still starts the car. Then no new dash warning lights. The FobPro post-job checklist is this list; let the customer test it themselves too.

### If something goes wrong mid-job
Stop. Don't keep tapping, don't unplug. Check battery voltage first, reseat the OBD plug, read the immobilizer status *before* attempting another write. The Help tab troubleshooter covers the common failures. The cardinal rule: **one failed attempt is information; three failed attempts is a bricked module.**

---

## Part 3 — Knowing your machines (2026 tool landscape)

- **Autel KM100** (~$429) — your primary. OBD add-key on most mainstream vehicles, universal IKEY generation, chip cloning. **No AKL on Toyota/Lexus, GM, Ford, Mazda, Nissan, or Stellantis in North America since late 2024** (Autel removed it; the removal is permanent — no rollback works once the tool has been online). Hyundai/Kia/Subaru/VW AKL still works.
- **Xhorse (VVDI Key Tool Max / FT-OBD)** — strong cloner; Toyota add-key & AKL up to ~2023 models; good VW.
- **Lonsdor K518** — the Toyota/Lexus specialist. AKL on 8A/4A needs the ADP adapter; **2025+ Toyota (BA/B6 immobilizers) add-key arrived July 2026 and requires the FP30 30-pin cable — AKL for 2025+ doesn't exist aftermarket yet, on any tool.**
- **Autel IM508S / IM608 Pro II** — the upgrade path: EEPROM/bench work, dealer-level coverage, VW MQB, real AKL capability on domestic makes. The IM608 is what "refer out" usually means.
- Rule of thumb: **quote only what today's tool + today's software can do.** Coverage claims age fast — when in doubt, scan the car before committing to a price.

---

## Part 4 — What changed recently (why old YouTube videos lie to you)

1. **The 2024 Autel AKL removal** (above). Any guide that shows a KM100/IM508 doing Toyota AKL in North America is pre-late-2024.
2. **2025+ Toyota/Lexus** moved to BA/B6-type immobilizers. Aftermarket add-key barely arrived (Lonsdor, July 2026); AKL = dealer tow. Quote accordingly.
3. **Hyundai/Kia theft-wave fallout** — two practical effects:
   - Many **2011–2021 base turn-key trims have no immobilizer at all**. A plain mechanical cut key starts them: no chip, no programming, a 15-minute job with near-total margin. Always test-read for a chip before assuming programming is needed.
   - The free **2023 anti-theft software update** adds an "ignition kill": the car won't crank unless it was **unlocked with the remote**. A cut-only key won't start an updated car — the customer needs a working remote too, or you program one.
4. **Gateways everywhere** — Stellantis SGW (2018+, bypass cable or AutoAuth), Ford gateway (2020+ Explorer/Escape, 2021+ F-150), GM CAN FD (2019+ trucks, 2021+ SUVs). None are dead-ends, but each is a "verify your tool connects before quoting" flag — FobPro shows these per vehicle.
5. **Chip families in the fleet right now**: Toyota H/8A · Honda G/ID47 (→ 4A on 2022+) · Ford ID49 Hitag Pro (2015+) · GM ID46E (→ ID49 on 2021+ prox) · Nissan 4A (2019+) · Hyundai/Kia ID46/ID47/4A by year · Stellantis ID46 → 4A (2019+ Ram DT) · VW MQB48. You never identify chips by sight — the tool reads them — but knowing the family tells you whether a job is cloneable and which blank to buy.
6. **Used/second-hand fobs are a trap** on most modern makes — Toyota smart fobs, Hyundai/Kia, Nissan prox fobs generally can't be re-virginized with budget tools. Sell new OEM or quality aftermarket (Xhorse universals are the field standard); refuse eBay "used, worked when removed" fobs politely.

---

## Part 5 — Running it as a business (Mississippi edition)

### Mississippi setup, step by step (verified 2026)
1. **LLC**: file a Certificate of Formation online with the MS Secretary of State — **$50**. Annual report required but **free** for domestic LLCs. A DBA (trade name) is $25 if you want a different public name.
2. **EIN**: free from the IRS online, 10 minutes.
3. **Sales tax**: register on MS TAP (Taxpayer Access Point) — free permit. Locksmith services are taxable at 7% + local add-ons (Jackson +1%). The app's quote tab calculates it; file monthly or quarterly per your assignment.
4. **No locksmith license exists in Mississippi** — your invoice trail and ownership-verification records ARE your compliance story.
5. **Insurance**: general liability before the first customer car (~$40–80/mo mobile locksmith). Add commercial auto if the vehicle is business-titled; inland marine rider once tool value exceeds a few thousand dollars.

### Add-on services worth carrying from day one
- **Lockouts ($75–150, zero parts cost).** Kit: air wedge + long-reach tool (~$40–90 from any locksmith distributor). Technique: wedge the top corner of the door gently, inflate to a small controlled gap, reach the unlock button or pull handle. Cautions: verify ownership *before* opening; frameless-glass doors (Mustang, Challenger, Camaro, Teslas) chip easily — wedge low and slow; a "double-locked"/deadlocked European car can't be opened from the inside button — refer it rather than fight it. After-hours lockouts command the top of the range.
- **Fob battery swaps ($35–55 mobile, or $15–25 as an add-on).** Five minutes, pure margin, and a trust-builder that converts to spare-key sales. Test the fob BEFORE swapping — a fob that still fails after a fresh battery is a programming/hardware job, and you want the customer to watch you prove it.

### Warranty & callback policy (industry norm)
- **30-day workmanship warranty**: if a key you programmed stops being recognized within 30 days, without customer damage, you re-program free. It's cheap goodwill — genuine programming failures inside 30 days are rare.
- **Parts**: manufacturer's warranty passes through (most distributors warranty aftermarket fobs 90 days–1 year; keep the vendor invoice).
- **Customer-supplied parts**: labor-only, no warranty on their part — say it up front and it's printed on the invoice.
- **Track callbacks in the Jobs tab** (status: "Callback / warranty return"). More than ~1 callback per 20 jobs means a process problem — usually skipped post-job testing.

### Legal & liability
- **Verify ownership on every job, every time.** Photo ID **plus** registration or insurance card matching the vehicle (bill of sale for just-bought cars). Names don't match → lock it back up, charge the service-call fee, leave. Photograph/record the documents with the invoice. This is what stands between you and "accessory to auto theft."
- Mississippi has **no state locksmith license**, which means your paper trail *is* your protection: invoice every job (FobPro generates one with the no-refund policy and signature lines), keep the ownership records with it.
- **Sales tax**: locksmith services in MS are taxable at 7% (+ local, e.g. Jackson +1%). FobPro's quote tab calculates it. Set aside tax money as you collect it.
- Get **general liability insurance** (~$40–80/mo for a mobile locksmith) before you touch customer property. One bricked BCM on an out-of-warranty European car costs more than a year of premiums.
- Form an LLC, open a separate bank account, take cards (Square/Stripe reader). Cash-only looks sketchy on exactly the jobs where trust matters.

### Pricing (2026 market reality)
- Add-key with fob: **$150–250** · Smart/prox key: **$200–300** · All-keys-lost: **$250–400+** · Clone/duplicate: **$85–120** · Lockout: **$75–150** · Travel beyond ~15 mi: **+$1–2/mile**.
- Dealers run $300–600 on AKL and often need the car towed to them — your mobile-service premium is justified. Don't be the cheapest; be the one who answers the phone and shows up.
- Parts margin matters: an $18 aftermarket prox fob sells inside a $220 job. Stock the top-20 fobs for your area (FobPro's Jobs log tells you what your actual top-20 is after a few months).

### Getting work
1. **Google Business Profile first** — most "car key replacement near me" calls go to whoever has 20+ reviews and answers. Ask every happy customer for a review on the spot.
2. **Wrap the vehicle** — a mobile trade sells itself in parking lots.
3. **B2B feeds beat B2C**: used-car dealers, repo companies, property managers, body shops, tow operators all lose keys constantly and pay invoices, not haggles.
4. **Answer after hours.** Emergency AKL at 9 PM is the highest-margin call in the trade.

### Learning path
- **ALOA's 5-day Fundamentals of Automotive Locksmithing** (~40 CEU hours) is the recognized entry course; the **CAL (Certified Automotive Locksmith)** credential is worth having on the website.
- Shadow an established locksmith for AKL jobs before doing your first solo one.
- Communities that answer real questions: r/Locksmith, the Auto Locksmith Forum, tool-brand Facebook groups (Lonsdor/Autel/Xhorse user groups are where update news lands first).
- Practice protocol for every new vehicle type: buy the fob, program it to a junkyard/friend's car *before* a paying customer's. FobPro's "proven" tracker exists for exactly this.

### The five beginner mistakes that cost real money
1. Programming on a weak battery (bricked immobilizer).
2. Deleting keys without every key present (customer's spare at home now dead).
3. Ordering by looks instead of FCC ID/frequency (wrong part, wasted trip).
4. Retrying failed PIN reads until the module locks out.
5. Taking an AKL job the tool can't finish (know the Part 4 list cold; check the FobPro verdict before quoting).

---

## Part 6 — Sourcing & inventory (the scalable method)

### The four-rung sourcing ladder
Buy the cheapest rung that does the job; climb only when the vehicle or customer demands it.

1. **Universal programmable remotes — 60–70% of jobs, 5–10 SKUs.** Autel IKEY universals pair with the KM100; Xhorse XS/XE/XN/XK-series universals (generated by any Xhorse VVDI tool) cover thousands of models and support ID46/47/49/4A/4D/63/MQB48. Xhorse XS supports **unlimited regeneration** — a wrongly-generated key goes back in the bin instead of the trash. This is the single biggest inventory-cost killer in the trade.
2. **Model-specific quality aftermarket** (KeylessOption, Keyless2Go, Dorman) — factory look for less. Buy from locksmith distributors, not marketplace sellers: counterfeit boards with real-looking labels are a genuine problem on Amazon/eBay.
3. **Refurbished OEM** — original tested boards in fresh shells, roughly half dealer price, true-OEM electronics. Only from distributors who bench-test before shipping (the majors mark refurb lines clearly). This is NOT a used eBay fob — those are usually VIN-locked and worthless.
4. **New OEM** — **Strattec** manufactures most GM/Ford/Stellantis keys; buying Strattec through a distributor IS buying OEM, at wholesale. Dealer parts counter for late-model prox (2023+) and anything 2025+ Toyota.

Batteries (CR2032/CR2450/CR2025/CR1620) in Panasonic/Energizer bulk from a distributor. Blades: Ilco blanks + emergency inserts for your top keyways.

### Vendors (verified active, July 2026)
| Vendor | Best for |
|---|---|
| **UHS Hardware** | Default primary — huge catalog, universal-key collections, van-stock starter bundles ("Essentials" packs run 42–100+ key assortments) |
| **American Key Supply** | Distribution + their Locksmith Academy training; strong OEM/refurb |
| **Locksmith Keyless** | Deep FCC-ID-searchable catalog including 2024–26 models — the exact-part hunt |
| **Transponder Island** | Wholesale keys/remotes, locksmith accounts |
| **Best Key Supply** | Discount aftermarket volume |
| **Key4 / Royal Key Supply / ABKeys / MK3** | OEM lines + Xhorse universals (MK3 is a major US Xhorse channel) |
| **Dealer parts counter** | 2025+ Toyota, oddballs, VIN-cut blades |
| **Amazon/eBay** | Batteries and empty shells ONLY — never critical electronics |

**Account strategy:** open a wholesale account with ONE primary (tax-exempt pricing; net terms come with volume) plus one backup for stockouts. Batch orders weekly — shipping is where small orders bleed money.

### Inventory strategy that scales
- **Start small and data-driven:** ~$400–600 opening stock matched to your area's top vehicles (the app's Ref tab has the checklist; the DB's high-volume models are Camry/Corolla/RAV4, F-150, Silverado, Altima, Civic/Accord, Ram, Elantra/Sonata).
- **Let the Jobs log run purchasing.** Every job records the exact shell part # and FCC ID used. Monthly review: anything used in the last 60 days → par level 2; used once ever → par 1; reorder when you open the last one.
- **Universals absorb the long tail.** Don't stock a model-specific fob until the log shows the model twice.
- **Storage:** labeled bins by make, FCC ID on every label, batteries in a dated tray (they age), blades on a ring by keyway.
- **Never stock used OEM prox fobs.** They're VIN-locked liabilities. Refurb from a bench-testing vendor or nothing.

---

## Part 7 — Pitfalls: learning from other people's scars

Every entry here is documented, not hypothetical. The app's Learn tab carries the working version with protocols; this is the background.

1. **The scam-network problem is bigger than you think.** The [locksmith scam](https://en.wikipedia.org/wiki/Locksmith_scam) is an organized model: thousands of fake "local" listings route to national call centers, quote $29, dispatch an unlicensed sub, then extort $200-400 cash on-site. The **FTC logged 4,500+ locksmith complaints in 2024**. Consequences for you: customers arrive pre-burned and suspicious, and lead-gen networks will offer to "send you work" — becoming their dispatch sub rents out your hands and torches your name. Counter-strategy: real address on your Google profile, phone quotes you honor in writing, insurance mentioned up front, cards accepted, and report listing-squatters to Google.
2. **Bricked modules are the trade's tuition — don't pay it.** Documented cases (BMW FEM, VW BCM) all share a shape: out-of-lane make + marginal voltage or a flaky cable + retry-on-failure. A killed module is $1,500-3,000 plus a tow plus the review. The app's verdict card, voltage gate, and one-retry rule exist because of these stories.
3. **The stolen-car setup is real.** Urgency + odd location + "lost the paperwork" + cash bonus to hurry = walk away. Locksmiths have been prosecuted as accessories. Ownership verification has no VIP exceptions.
4. **Night-call safety protocol** (highest-margin calls, highest physical risk): confirm the callback number before rolling; share live location; park nose-out under light; advertise card payment (less cash on you); dash cam covering the work area; unconditional walk-away rule.
5. **Underquoting, cheap tools, burnout, dead inventory** — the four slow killers, each with its protocol in the app: price from the tiers without flinching; buy quality once (a $30 knockoff cable is priced against a $1,500 module); after-hours is premium not obligation, one protected day weekly; stock follows the log, never the catalog.

---

*Sources: ALOA education catalog; UHS Hardware, American Key Supply, Locksmith Ledger and Workiz business guides (2026); locksmith supplier part listings (Locksmith Keyless, UHS, Key4, American Key Supply); Lonsdor/Xhorse/Autel update notes via OBDII365/VXDAS (2025–2026); NHTSA/Hyundai anti-theft campaign documentation; CLK Supplies ownership-verification guidance.*
