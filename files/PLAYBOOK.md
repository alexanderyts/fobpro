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
5. **Verify the part** — match the FCC ID on the customer's old fob (or FobPro's lookup + the year) to the fob in your hand. Frequency and chip must match; a 433 MHz remote will never pair to a 315 MHz car even if the shell is identical.
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

*Sources: ALOA education catalog; UHS Hardware, American Key Supply, Locksmith Ledger and Workiz business guides (2026); locksmith supplier part listings (Locksmith Keyless, UHS, Key4, American Key Supply); Lonsdor/Xhorse/Autel update notes via OBDII365/VXDAS (2025–2026); NHTSA/Hyundai anti-theft campaign documentation; CLK Supplies ownership-verification guidance.*
