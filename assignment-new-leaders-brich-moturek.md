# Assignment: Two new leaders — Dezněk Břich (Piráti) and Flipflip Motůrek (Motoristé)

**For:** developer (Claude Code)
**From:** Daniel
**Status:** new content + one small engine extension, on top of the current `main`
**Read first:** `CLAUDE.md`, `budget-inc-spec.md` §5 (leaders), `DECISIONS.md` (abilities P17, STB/blame P24, skill tree P29), `SKILLTREE.md`, `REGIONS.md`, `src/core/abilities.ts`

## Goal

Add two fully playable leaders next to Kartin Mupka and Bander Abis. They are **real content, not `[DUMMY]` / `[FILLER]`**: everything below (names, numbers, ability texts, signature policy cards) is written by Daniel and goes into the game as-is. Tune numbers only in the balance step (Part G) and log every change in `DECISIONS.md`.

All project rules still apply: pure deterministic core, tunables in `src/config.ts`, content in `data/*.json` (zod-validated), Czech only in locale files, no network calls, phase gate at the end.

---

## Part A: The idea behind the two leaders

### A1. Dezněk Břich — Piráti

> *„Ukážeme světu, že nejsme skanzen. Hlavně Tchaj-wanu.“*

Satire of the Pirate chair and ex-mayor of Prague. A doctor turned manager who runs the country like a city hall with a foreign-policy department. Strong abroad, beloved in Prague, mistrusted by pensioners and anywhere without a tram line. Everything gets an app; the app crashes on launch day; two years later it actually saves money.

- **Playstyle:** prestige engine + slow-burn finances. Starts with the highest Prestige of any leader and the lowest anger from Media / EU / Activists, but Pensioners and Oligarchs are already annoyed. Weak in the regions outside Prague and Brno.
- **Fantasy:** "I win the election on the world stage and in Prague, and hope the rest of the country follows the tram tracks."
- **Risk:** finances start low and the digital ability costs Support first, pays later.
- **Leader tree theme (later):** Transparentnost & digitalizace.

### A2. Flipflip Motůrek — Motoristé

> *„Sto třicet je rychlost pro traktory.“*

Satire of the Motorists' MP: ex-racing driver, classic-car collector, chairman of a Jaguar fan club with three members, sworn enemy of the Green Deal — and, by a twist of fate, the government's **climate commissioner** after the Castle refused to make him a minister. He turns every rejection into a campaign.

- **Playstyle:** Support rocket with a burning fuse. Highest raw Support gains, lowest Prestige, EU and Activists start very angry. Strong in Ústecký, Karlovarský and Moravskoslezský kraj, weak in Prague.
- **Fantasy:** "Full throttle, ignore Brussels, and let the Castle make you a martyr."
- **Risk:** Prestige near zero and two anger meters near the top from day one; finances bleed on cheap fuel.
- **Leader tree theme (later):** Plný plyn & deregulace.

### A3. Satire boundaries (keep to these)

Both leaders are satire of **public political conduct**: policy positions, public roles, campaigns, well-known public episodes (the Taiwan/Beijing sister-city dispute, digital building permits, the Green Deal fight, the President's refusal to appoint, the climate-commissioner post, the classic-car hobby).

We deliberately **do not** joke about: alleged extremist symbols or remarks, the domestic-violence complaint, racist/sexist posts, the reported poisoning plot, family, health or appearance. No real names anywhere in game text, no real likenesses in sprites — same guardrail as the existing leaders (`CLAUDE.md` rule 4). Update that rule and spec §5 to list the two new parody names.

---

## Part B: Leader data (`data/leaders.json`)

Append these two entries. Ids: `brich`, `moturek`.

### B1. Overview

| | **Dezněk Břich (Piráti)** | **Flipflip Motůrek (Motoristé)** |
|---|---|---|
| Profile (cs) | Liberální progresivista, primátor s globálním dosahem | Pravicový libertarián s benzínem v žilách |
| Colour / light | `#52525b` / `#d4d4d8` (Pirate black; lighten if the map contrast fails) | `#f97316` / `#fdba74` (racing orange) |
| Start: finances / support / coalition / prestige | 45 / 45 / 50 / 70 | 55 / 55 / 40 / 35 |
| Start anger: oligarchs / media / eu / activists / pensioners | 45 / 25 / 15 / 25 / 60 | 15 / 50 / 55 / 60 / 30 |
| Compass start box | `c_prog` (Moderní tvář) | `c_trad` (Úcta ke kořenům) |
| Coalition partners | `stan`, `zeleni` | `ano`, `spd` |
| Abilities | Cesta na Tchaj-wan · Digitální stavebák · Tramvaj do každého kraje | Benzín za 29,90 · Zmocněnec pro klima · Hrad mě nechce |

For comparison: Mupka 60/40/55/60 (sum 215, anger 170), Abis 50/65/45/40 (sum 200, anger 175). Břich 210 / anger 170, Motůrek 185 / anger 210 — Motůrek trades worse starts for the strongest Support abilities.

### B2. Leaning weights (sum 100)

| Leaning | Mupka | Abis | **Břich** | **Motůrek** |
|---|---|---|---|---|
| libertarianism | 35 | 8 | **25** | **38** |
| conservatism | 35 | 15 | **8** | **27** |
| populism | 10 | 35 | **10** | **25** |
| socialism | 7 | 30 | **17** | **3** |
| progressivism | 8 | 5 | **35** | **2** |
| fascism | 3 | 3 | **2** | **4** |
| communism | 2 | 4 | **3** | **1** |

### B3. JSON

```json
{
  "id": "brich",
  "name": "leader.brich.name",
  "party": "leader.brich.party",
  "profile": "leader.brich.profile",
  "color": "#52525b",
  "colorLight": "#d4d4d8",
  "start": { "finances": 45, "support": 45, "coalition": 50, "prestige": 70 },
  "startAnger": { "oligarchs": 45, "media": 25, "eu": 15, "activists": 25, "pensioners": 60 },
  "leaningWeights": {
    "libertarianism": 25, "conservatism": 8, "populism": 10, "socialism": 17,
    "progressivism": 35, "fascism": 2, "communism": 3
  },
  "abilities": [
    {
      "id": "taiwan_trip",
      "name": "ability.taiwan_trip.name",
      "description": "ability.taiwan_trip.desc",
      "icon": "taiwan_trip",
      "modifiers": [
        { "type": "multiplier", "target": "prestige.gain", "value": 1.25, "days": 360 },
        { "type": "multiplier", "target": "prestige.loss", "value": 0.7, "days": 360 }
      ],
      "bundle": {
        "effects": {
          "prestige": { "min": 10, "max": 10 },
          "financesExtra": { "min": -4, "max": -4 }
        },
        "anger": {
          "eu": { "min": -8, "max": -8 },
          "oligarchs": { "min": 6, "max": 6 }
        }
      },
      "pulses": {
        "everyDays": 30, "times": 12,
        "bundle": { "effects": { "prestige": { "min": 0.75, "max": 0.75 } } },
        "label": "ability.taiwan_trip.pulse"
      },
      "action": null,
      "targetModifiers": []
    },
    {
      "id": "digital_permit",
      "name": "ability.digital_permit.name",
      "description": "ability.digital_permit.desc",
      "icon": "digital_permit",
      "modifiers": [
        { "type": "multiplier", "target": "finances.loss", "value": 0.85, "days": 360 },
        { "type": "add", "target": "pc.perQuarter", "value": 1, "days": 360 }
      ],
      "bundle": {
        "effects": { "support": { "min": -4, "max": -4 } },
        "anger": { "media": { "min": 6, "max": 6 } }
      },
      "pulses": {
        "everyDays": 30, "times": 12,
        "bundle": { "effects": { "financesExtra": { "min": 2.5, "max": 2.5 } } },
        "label": "ability.digital_permit.pulse"
      },
      "action": null,
      "targetModifiers": []
    },
    {
      "id": "tram_everywhere",
      "name": "ability.tram_everywhere.name",
      "description": "ability.tram_everywhere.desc",
      "icon": "tram_everywhere",
      "modifiers": [],
      "bundle": {
        "effects": { "financesExtra": { "min": -6, "max": -6 } },
        "anger": { "activists": { "min": -8, "max": -8 } },
        "regions": {
          "self": { "min": 8, "max": 8 },
          "CZ010": { "min": 2, "max": 2 }
        },
        "tags": ["transport"]
      },
      "pulses": null,
      "action": "regionTarget",
      "targetModifiers": []
    }
  ],
  "sprite": "brich"
}
```

```json
{
  "id": "moturek",
  "name": "leader.moturek.name",
  "party": "leader.moturek.party",
  "profile": "leader.moturek.profile",
  "color": "#f97316",
  "colorLight": "#fdba74",
  "start": { "finances": 55, "support": 55, "coalition": 40, "prestige": 35 },
  "startAnger": { "oligarchs": 15, "media": 50, "eu": 55, "activists": 60, "pensioners": 30 },
  "leaningWeights": {
    "libertarianism": 38, "conservatism": 27, "populism": 25, "socialism": 3,
    "progressivism": 2, "fascism": 4, "communism": 1
  },
  "abilities": [
    {
      "id": "cheap_fuel",
      "name": "ability.cheap_fuel.name",
      "description": "ability.cheap_fuel.desc",
      "icon": "cheap_fuel",
      "modifiers": [],
      "bundle": {
        "effects": {
          "support": { "min": 8, "max": 8 },
          "financesExtra": { "min": -6, "max": -6 }
        },
        "anger": {
          "pensioners": { "min": -8, "max": -8 },
          "eu": { "min": 8, "max": 8 },
          "activists": { "min": 6, "max": 6 }
        },
        "tags": ["transport"]
      },
      "pulses": {
        "everyDays": 30, "times": 12,
        "bundle": {
          "effects": {
            "support": { "min": 0.5, "max": 0.5 },
            "financesExtra": { "min": -1, "max": -1 }
          }
        },
        "label": "ability.cheap_fuel.pulse"
      },
      "action": null,
      "targetModifiers": []
    },
    {
      "id": "climate_commissioner",
      "name": "ability.climate_commissioner.name",
      "description": "ability.climate_commissioner.desc",
      "icon": "climate_commissioner",
      "modifiers": [
        { "type": "multiplier", "target": "anger.eu.gain", "value": 0.5, "days": 360 },
        { "type": "multiplier", "target": "anger.activists.loss", "value": 0.5, "days": 360 }
      ],
      "bundle": {
        "anger": {
          "eu": { "min": -10, "max": -10 },
          "activists": { "min": 10, "max": 10 }
        }
      },
      "pulses": {
        "everyDays": 30, "times": 12,
        "bundle": { "effects": { "financesExtra": { "min": 2, "max": 2 } } },
        "label": "ability.climate_commissioner.pulse"
      },
      "action": null,
      "targetModifiers": []
    },
    {
      "id": "castle_rejection",
      "name": "ability.castle_rejection.name",
      "description": "ability.castle_rejection.desc",
      "icon": "castle_rejection",
      "modifiers": [
        { "type": "multiplier", "target": "support.loss", "value": 0.7, "days": 360, "source": "chaos" },
        { "type": "multiplier", "target": "support.loss", "value": 0.7, "days": 360, "source": "special" },
        { "type": "add", "target": "election.T_base", "value": -1 }
      ],
      "bundle": {
        "effects": {
          "support": { "min": 10, "max": 10 },
          "prestige": { "min": -8, "max": -8 },
          "coalition": { "min": -4, "max": -4 }
        },
        "anger": { "media": { "min": 6, "max": 6 } }
      },
      "pulses": null,
      "action": null,
      "targetModifiers": []
    }
  ],
  "sprite": "moturek"
}
```

Notes:
- `castle_rejection`'s `election.T_base` modifier has **no `days`**: it is permanent until the election. Check that the leader dock's "Běží ještě {n} měs." line copes with a permanent modifier (show the 12-month part, or nothing for the permanent part).
- `tram_everywhere` uses the new `regionTarget` action (Part C). If the target is Praha, both keys apply (Praha +10).
- Check `tags` values against `config.regions.tags`; drop a tag if it is not in that list.

### B4. Locale texts (`locales/cs.json`)

```json
{
  "leader.brich.name": "Dezněk Břich",
  "leader.brich.party": "Piráti",
  "leader.brich.profile": "Liberální progresivista, primátor s globálním dosahem",
  "leader.moturek.name": "Flipflip Motůrek",
  "leader.moturek.party": "Motoristé",
  "leader.moturek.profile": "Pravicový libertarián s benzínem v žilách",

  "ability.taiwan_trip.name": "Cesta na Tchaj-wan",
  "ability.taiwan_trip.desc": "Hned Prestiž +10 a EU −8 (Brusel tleská). Jenže Oligarchové +6 a Finance −4: čínská zakázka je pryč a filharmonie nepřijede. 12 měsíců: prestiž roste o čtvrtinu rychleji, ztrácíš jí o 30 % méně a každý měsíc přijde zahraniční ohlas +0,75 Prestiže.",
  "ability.taiwan_trip.pulse": "Zahraniční ohlas {n}/{of}",

  "ability.digital_permit.name": "Digitální stavebák",
  "ability.digital_permit.desc": "Spustíš digitální stavební řízení. První den spadnou servery: Podpora −4, Média +6. Pak 12 měsíců: každý měsíc Finance +2,5 (ušetřená razítka), ztráty Financí bolí o 15 % méně a každé čtvrtletí dostaneš o 1 politický kapitál víc.",
  "ability.digital_permit.pulse": "Ušetřená razítka {n}/{of}",

  "ability.tram_everywhere.name": "Tramvaj do každého kraje",
  "ability.tram_everywhere.desc": "Vyber kraj a slib mu tramvaj. Podpora v něm trvale +8 a v Praze +2, protože se stejně přestupuje na Florenci. Aktivisté −8, Finance −6.",

  "ability.cheap_fuel.name": "Benzín za 29,90",
  "ability.cheap_fuel.desc": "Snížíš spotřební daň. Hned Podpora +8 a Důchodci −8, ale EU +8, Aktivisté +6 a Finance −6. 12 měsíců: každý měsíc Podpora +0,5 a Finance −1, protože stát tankuje za tebe.",
  "ability.cheap_fuel.pulse": "Tankovací bonus {n}/{of}",

  "ability.climate_commissioner.name": "Zmocněnec pro klima",
  "ability.climate_commissioner.desc": "Ujmeš se klimatické politiky. Brusel má zaškrtnuté políčko (EU −10), Aktivisté vyletí z kůže (+10). 12 měsíců: EU se zlobí jen napůl, Aktivisty jde uklidnit jen napůl tak snadno a každý měsíc Finance +2, protože obchvat je taky klimatické opatření.",
  "ability.climate_commissioner.pulse": "Klimatický obchvat {n}/{of}",

  "ability.castle_rejection.name": "Hrad mě nechce",
  "ability.castle_rejection.desc": "Prezident tě odmítl jmenovat a ty z toho uděláš kampaň. Hned Podpora +10, ale Prestiž −8, Média +6 a Stabilita koalice −4. 12 měsíců: zlé zprávy (události a zvláštní karty) berou o 30 % méně podpory. Navíc až do voleb potřebuješ k výhře o 1 méně: soucit voličů.",

  "ability.pick.region": "Kam povede nová trať?",
  "ability.pick.regionNote": "Vybraný kraj dostane trvale +8 podpory, Praha navíc +2."
}
```

---

## Part C: Engine — new ability action `regionTarget`

The only new mechanic. Everything else uses existing primitives (modifiers, bundle, pulses).

**Behaviour:** the player picks a kraj; the ability's bundle is applied with the region key `self` replaced by that kraj (exactly like skill-tree actives with `target: "region"`, `resolveSelf` in `src/core/upgrades.ts`).

Changes:
1. `src/core/types.ts` — `AbilityAction = 'cancelEvent' | 'halveAnger' | 'regionTarget'`; update the doc comments.
2. `src/data/schemas.ts` — add `'regionTarget'` to the ability `action` enum. Loader check: a `regionTarget` ability's bundle must contain `regions.self`; any other region key must be a known kraj code.
3. `resolveSelf` — move it from `src/core/upgrades.ts` to `src/core/effects.ts` (or another shared core module) and import it in both places. `upgrades.ts` is a skill-tree seam: keep that edit to the import line and mention it in the PR.
4. `src/core/abilities.ts`
   - `canUseAbility`: for `regionTarget`, return `'choose a kraj'` unless `target` is a kraj code in `sim.data.regions`.
   - `activateAbility`: apply `resolveSelf(a.bundle, target)` instead of `a.bundle` for `regionTarget`.
5. `src/core/simulation.ts` `previewAbility` — preview the resolved bundle when a kraj is given.
6. UI
   - `src/ui/modals/AbilityPicker.tsx`: a kraj list for `regionTarget` (same two-column kraj list as the skill-tree target picker), title `ability.pick.region`, note `ability.pick.regionNote`, each row shows the kraj's support now → after.
   - `src/ui/hud/LeaderDock.tsx`: a `regionTarget` ability opens the picker (like `halveAnger`).
7. Bots (`src/core/bots.ts`)
   - random bot: random kraj.
   - greedy bot: the kraj with the most seats among those within ±8 points of the national support (fallback: most seats).
8. Log: `ability_used` already logs `target`; replay must reproduce it (covered by the existing replay test once a `regionTarget` use is in the test log).

---

## Part D: Content pools, partners, regions, skill tree

### D1. Signature policy cards (new file `data/policies/leaders_brich_moturek.json`)

Real cards, `devOnly: false`, no chaos events yet (`chaosEvents` omitted). Texts go under `policy.<id>.*` in `locales/cs.json`. After adding, run `python scripts/policy_docx.py export` and save the document as `content/policies/Policies_leaders_brich_moturek.docx` so the team can edit it in Word like the others.

Budget chapters: `312` digital/administration, `314` police/administration, `315` environment/energy, `327` transport, `335` health.

**Břich (`availableFor: ["brich"]`)**

| id | leaning | topic | title | description | drivenBy | effects | anger | budget / ongoing |
|---|---|---|---|---|---|---|---|---|
| `brich_taiwan_twin` | progressivism | Praha mění partnerské město | „Partnerské město si vybírám podle hodnot, ne podle pand.“ | Smlouvu s Pekingem vypovíme a podepíšeme novou s Tchaj-pejí. Filharmonie sice na turné nepojede, ale zato máme bubble tea. | Odbor zahraničních vztahů a tchajwanská kancelář | support −1…2, prestige 4…7, financesExtra −3…−1 | oligarchs 4…6, eu −4…−2 | — |
| `brich_digital_permit` | libertarianism | Stavební úřady přecházejí na digitál | „Stavební povolení si vyřídíte z gauče. Až to začne fungovat.“ | Razítka nahradí aplikace. První dva roky to bude padat, pak ušetříme miliardy. Doufáme. | Pirátští ajťáci a svaz developerů | support −3…−1, coalition −2…0, prestige 1…3 | oligarchs −4…−2, media 2…4 | 312 exp +8 %; ongoing finances +0.03/day, 360 days, label „Úspory z digitalizace“ |
| `brich_bike_lanes` | progressivism | Cyklopruhy místo parkování | „Kdo chce parkovat v centru, ať si koupí kolo.“ | Z každého druhého parkovacího místa uděláme cyklopruh. Řidiči budou zuřit, ale aspoň se projdou. | Cyklistická lobby z Letné | support −2…1, prestige 1…2 | activists −6…−4, pensioners 3…5, oligarchs 1…2 | 327 exp +5 % |
| `brich_open_contracts` | libertarianism | Transparentní zakázky | „Každou fakturu na web. I tu za chlebíčky.“ | Všechny smlouvy státu budou online do hodiny. Oligarchové budou muset korupci aspoň pořádně schovat. | Protikorupční spolky a nespokojení novináři | support 2…4, coalition −4…−2, prestige 2…3 | oligarchs 6…9, media −5…−3 | 312 exp +3 % |
| `brich_hsr_brno` | socialism | Vysokorychlostní trať | „Do Brna za hodinu. Pravnoučata to ocení.“ | Spustíme největší dopravní stavbu v dějinách. Výkopy začnou hned, koleje možná za třicet let. | Správa železnic a jihomoravští hejtmani | support 1…3, prestige 1…3, coalition 1…2 | activists 2…4, pensioners −1…1 | 327 exp +18 % |
| `brich_health_app` | socialism | Zdravotnictví v mobilu | „Jako lékař vám říkám: tohle bude trochu bolet.“ | Celé zdravotnictví převedeme do jedné aplikace a lékaři dostanou přidáno. Pacienti si konečně přečtou, co jim doktor napsal. | Lékařská komora a startup z Karlína | support 2…4, prestige 1…2 | pensioners 1…4, activists −2…0 | 335 exp +7 % |

**Motůrek (`availableFor: ["moturek"]`)**

| id | leaning | topic | title | description | drivenBy | effects | anger | budget / ongoing |
|---|---|---|---|---|---|---|---|---|
| `moturek_ice_forever` | conservatism | Brusel zakazuje spalovací motory | „Spalovák vám vezmou jen přes mou studenou karoserii.“ | Zákaz prodeje aut se spalovacím motorem nepodepíšeme. Klidně budeme poslední v Evropě, kdo ještě voní benzínem. | Svaz dovozců aut a autokluby | support 3…5, prestige −5…−3 | eu 8…12, activists 5…7, pensioners −3…−1 | — |
| `moturek_speed_160` | libertarianism | Rychlostní limity | „Sto třicet je rychlost pro traktory.“ | Na dálnicích zvedneme limit na 160. Kdo chce jet pomaleji, ať jede vlakem, pokud ještě nějaký jezdí. | Facebooková skupina „Levý pruh je můj“ | support 2…4, prestige −2…0 | activists 4…6, eu 1…3, pensioners 1…3 | 327 exp +2 %; ongoing support −0.02/day, 90 days, label „Víc nehod na dálnicích“ |
| `moturek_green_deal_bin` | populism | Green Deal | „Green Deal zmuchláme a hodíme do kamen. Do těch na uhlí.“ | Zelené dotace pošleme na asfalt a povolenky přestaneme řešit. Brusel nám to spočítá, ale my máme kalkulačku taky. | Ocelárny, cementárny a pár hejtmanů | support 3…6, prestige −6…−3, coalition −1…1 | eu 10…14, activists 6…9, oligarchs −4…−2 | 315 exp −15 % |
| `moturek_veteran_tax` | libertarianism | Silniční daň | „Jaguár z roku 1974 není auto. Je to kulturní památka.“ | Historická vozidla osvobodíme od všech daní a poplatků. Fanklub má sice jen tři členy, ale velmi hlasité. | Jaguár klub ČR (3 členové) | support −1…1, coalition −1…1, financesExtra −2…−1 | oligarchs −3…−1, pensioners −1…1 | — |
| `moturek_cut_offices` | libertarianism | Rušení úřadů | „Tři ministerstva zrušíme. Razítka bude vydávat nikdo.“ | Zavřeme tři ministerstva a dvacet úřadů. Kdo bude vydávat povolení? Nikdo, a o to přesně jde. | Think-tank Svobodná dálnice | support 1…3, coalition −5…−3 | media 2…4, pensioners 2…4, oligarchs −2…0 | 314 exp −8 %, 312 exp −6 % |
| `moturek_coal_forever` | conservatism | Energetika | „Elektřina má být levná a voňavá jako dřív.“ | Uhelné elektrárny necháme běžet, dokud se nerozpadnou. Pak je opravíme. | Uhelné firmy a odbory z Mostu | support 2…4, prestige −3…−1 | activists 6…8, eu 4…6, pensioners −4…−2 | 315 exp +6 % |

If the policy schema accepts `tags` (regions assignment C5), add: `brich_bike_lanes` `["transport","environment"]`, `brich_hsr_brno` / `moturek_speed_160` / `moturek_ice_forever` `["transport"]`, `moturek_green_deal_bin` / `moturek_coal_forever` `["industry","environment"]` — only values in `config.regions.tags`.

### D2. Shared card pools

- Add `"brich"` and `"moturek"` to `availableFor` of **every** card in `data/policies/_filler.json` and `data/policies/dummy.json`. The leaning weights steer what they draw; no new filler texts.
- Same for `data/compromises/_filler.json` and `data/compromises/dummy.json`.
- `data/events/_filler.json`: if events are tied to leaders, leave them; cards keep their `chaosEvents` links.
- Do **not** run `npm run gen:filler` for this unless you have checked it keeps every card with a topic and does not rewrite the team's cards. Prefer the `availableFor` edit.
- Re-import check: `policy_docx.py` export/import of the filler documents must still round-trip unchanged (the availableFor column changes once, then stays stable).
- Each new leader must have ≥ 19 eligible cards with filler on and ≥ 3 with filler off (validator rules).

### D3. Coalition partners (`data/annual/coalition_requests.json`)

```json
"partners": {
  "mupka": ["kdu_csl", "top09"],
  "abis": ["spd", "motoriste"],
  "brich": ["stan", "zeleni"],
  "moturek": ["ano", "spd"]
}
```
Add the missing preferences (status stays `DUMMY` like the rest):
```json
"stan":   { "raise": ["regional_dev", "digital", "education", "defence", "housing"], "cut": ["administration", "pensions", "agriculture"] },
"zeleni": { "raise": ["environment", "transport", "ngos", "culture", "science"], "cut": ["defence", "energy", "police"] },
"ano":    { "raise": ["pensions", "agriculture", "transport", "regional_dev", "health"], "cut": ["ngos", "culture", "foreign_aid", "environment"] }
```
Yes, Motůrek governs with ANO — Bander Abis as a junior partner is intended.

### D4. Regional offsets — regions workspace seam (`data/regions.json`, branch `Danko2`)

The loader defaults missing offsets to 0, so the game works without this; add it as a small seam commit and tell the regions side.

| Kraj | Břich | Motůrek |
|---|---|---|
| CZ010 Praha | **+7** | −4 |
| CZ020 Středočeský | +2 | +2 |
| CZ031 Jihočeský | −1 | 0 |
| CZ032 Plzeňský | 0 | +2 |
| CZ041 Karlovarský | −3 | +3 |
| CZ042 Ústecký | −4 | **+4** |
| CZ051 Liberecký | +1 | 0 |
| CZ052 Královéhradecký | 0 | 0 |
| CZ053 Pardubický | 0 | +1 |
| CZ063 Vysočina | −2 | +1 |
| CZ064 Jihomoravský | +3 | −2 |
| CZ071 Olomoucký | 0 | 0 |
| CZ072 Zlínský | +1 | 0 |
| CZ080 Moravskoslezský | −3 | +2 |

### D5. Compass start boxes — skill-tree workspace seam (`data/upgrades/compass.json`, branch `David`)

```json
"start": { "mupka": "c_r1t", "abis": "c_l1t", "brich": "c_prog", "moturek": "c_trad" }
```
The two new leaders start in the **middle column**, so they can grow to either side — Břich up from Progrese, Motůrek down from Tradice. Update `SKILLTREE.md` ("Start box") and any skill-tree test that assumes a `…1t` start. Tell the skill-tree side.

---

## Part E: UI and art

- `src/ui/LeaderSprite.tsx`: placeholder pixel sprites for `brich` and `moturek` (same grid as the others) and `HAIR` colours (Břich `#2a2a2a`, Motůrek `#5a3a22`). Generic figures only — Břich with a small black pirate-flag pin, Motůrek with an orange scarf and driving gloves. No helmets, no likeness of the real people.
- `src/ui/abilityIcons.tsx`: six new pixel icons — `taiwan_trip` (plane), `digital_permit` (laptop + stamp), `tram_everywhere` (tram), `cheap_fuel` (fuel pump), `climate_commissioner` (thermometer with a tick box), `castle_rejection` (castle with a closed gate).
- Leader select (`src/ui/screens/LeaderSelect.tsx`): four cards in the existing `auto-fit` grid. Check desktop (2×2 or 4×1) and phone (one column, scrolls); the default selection stays the first leader.
- Party colour on the map, HUD and final screen: check contrast of `#52525b` on the dark UI; if it fails, use `#a1a1aa` and log it.

---

## Part F: Tests

- Replace hard-coded `['mupka', 'abis']` loops with the leader ids from the loaded data (`tests/abilities.test.ts`, `specialCards.test.ts`, `feedback.test.ts`, `data.test.ts`, `core.p5.test.ts`), so every leader is covered.
- New tests in `tests/abilities.test.ts`:
  - `taiwan_trip`: exact instant bundle, 12 pulses of +0.75 prestige, `prestige.gain` ×1.25 for 360 days.
  - `digital_permit`: support −4 now, +1 PC per quarter for 4 quarters, then back to normal.
  - `tram_everywhere`: refuses without a kraj; with `CZ042` the regional shift is +8 there and +2 in Praha; with `CZ010`, +10 in Praha; preview equals applied.
  - `castle_rejection`: `election.T_base` lowered by 1 until the election (still active after day 360).
  - `climate_commissioner`: EU anger gains halved, activists' anger losses halved, 12 pulses of +2.
- Data test: each leader has 3 abilities, a compass start box, coalition partners with preferences, ≥ 19 eligible cards with filler on.
- Replay test includes one `regionTarget` use.

---

## Part G: Balance

Run `npm run simulate -- --runs 1000 --bot both` (all leaders) on Normal.

Targets (spec §13 + `SKILLTREE.md`): random ≤ 15 %, greedy 20–40 %, all four leaders within about 10 points of each other.

Greedy-bot ability triggers in `greedyAbility` (add next to the existing ids):
- `taiwan_trip`: quarter ≥ 2 or prestige < 55
- `digital_permit`: early (quarter ≥ 2) — it pays off over time
- `cheap_fuel`: support < 50
- `climate_commissioner`: EU anger ≥ 55
- `castle_rejection`: support < 45 or last year
- `tram_everywhere`: handled by its `regionTarget` branch (Part C7)

Tuning order if a leader is off target: (1) start resources, (2) start anger, (3) ability numbers, (4) leaning weights. Never touch the existing leaders or shared config to fix the new ones. Record the final table (random/greedy × 4 leaders) in `DECISIONS.md` like the earlier balance entries.

---

## Part H: Docs and finish

- `CLAUDE.md` rule 4 and `budget-inc-spec.md` §5: add Dezněk Břich and Flipflip Motůrek to the parody-name list; add the two columns to the §5.1 leader table and §5.3 weights table.
- `README.md`: "Leaders" section lists four leaders and how to add one (leaders.json, locale keys, sprite, icons, regions offsets, compass start box, coalition partners, availableFor).
- `DECISIONS.md`: one line per non-obvious choice (e.g. `regionTarget`, `resolveSelf` move, middle-column start boxes, shared filler pool).
- Phase gate: `npm run typecheck && npm run lint && npm test && npm run build && npm run simulate -- --runs 200 --bot random`.
- Commits: `leaders: Břich and Motůrek data + texts`, `abilities: regionTarget`, `leaders: sprites, icons, select screen`, `leaders: balance`; seam commits for `regions.json` and `compass.json` separately so they merge cleanly into `Danko2` / `David`.

## Acceptance

- [ ] Four leaders on the select screen; each plays a full 16-quarter run on desktop and phone.
- [ ] Břich and Motůrek have their own start values, colours, sprites, three working abilities with icons, compass start box, coalition partners and regional offsets.
- [ ] Tramvaj do každého kraje opens a kraj picker, previews correctly and shifts that kraj's support permanently.
- [ ] Hrad mě nechce lowers the election threshold until the election.
- [ ] Each new leader is dealt their signature cards plus the shared pool; no run fails to deal a hand.
- [ ] No real names anywhere in game text.
- [ ] Simulator targets met for all four leaders; table in `DECISIONS.md`.
