# Budget Inc. — Proof of Concept

**Play:** https://dtmika2.github.io/Budget-Inc/ (deployed by `.github/workflows/deploy.yml` on every push to `main`)

A satirical browser strategy game: you are the Czech prime minister and have to survive a 4-year term
(16 quarters) and win the next election. Plague Inc.-style layout (static map of the 14 kraje, resource
bars, news pop-ups) with chunky pixel-art leaders. All player-facing text is Czech; code and docs are
English.

- Spec: [`budget-inc-spec.md`](budget-inc-spec.md) (source of truth) · brief: [`budget-inc-brief.md`](budget-inc-brief.md) · build plan: [`budget-inc-build-plan.md`](budget-inc-build-plan.md)
- Decisions made during the build: [`DECISIONS.md`](DECISIONS.md) · status and acceptance checklist: [`PROGRESS.md`](PROGRESS.md)

## Run

```bash
npm install
npm run dev          # http://localhost:5173  (add ?debug=1 for the developer overlay)
```

| Script | What it does |
|---|---|
| `npm run dev` / `npm run build` / `npm run preview` | Vite dev server / production build to `dist/` / serve the build |
| `npm run typecheck` · `npm run lint` · `npm test` | `tsc --noEmit` · ESLint · Vitest (core, data, UI store, guards) |
| `npm run simulate -- …` | headless simulator (see below) |
| `npm run analyze -- …` | balance helper: average end-of-run state, with in-memory overrides |
| `npm run gen:filler` | regenerate the `[FILLER]` cards/events/compromises |
| `npm run build:map` | rebuild `src/ui/map/regionsPath.ts` from GISCO boundaries (build time only) |

## Deploy (static hosting)

`npm run build` produces a fully static `dist/` folder with relative asset paths (`base: './'`), so it
works from any sub-path — GitHub Pages, Netlify, an S3 bucket, or just opening it from a web server.
There is no backend and **no network call at runtime**: data, locale and fonts are bundled.

- **GitHub Pages:** push `dist/` to a `gh-pages` branch (or use an Actions workflow that runs `npm ci && npm run build` and uploads `dist/`).
- **Netlify:** build command `npm run build`, publish directory `dist`.

## Architecture

```
src/core/     pure, deterministic TypeScript simulation (no DOM, no Date.now, no Math.random)
src/data/     zod schemas + loader + cross-file validation (environment-agnostic)
src/i18n/     t(key, params) over locales/cs.json
src/ui/       React 18 UI; store.ts bridges the core via useSyncExternalStore; clock.ts is the rAF loop
src/config.ts every tunable number + difficulty presets
data/         game content and data (JSON, validated at load)
locales/      cs.json — every Czech string
scripts/      simulate.ts, analyze.ts, gen-filler-cards.ts, build-map.ts
tests/        Vitest suites
```

- The UI owns real time only; it calls `sim.tick()` (one game day) and `sim.dispatch(input)` for every decision.
- Every decision is logged with the tick count it happened at, so a run replays exactly from its seed + inputs (`src/core/replay.ts`). The final screen exports the log as JSON (`budget-inc-<runId>.json`).
- One modifier pipeline (`src/core/modifiers.ts`) handles every value change: roll → global negative multiplier (if bad) → additive → multiplicative → clamp. Card / modal ranges are previewed through the same pipeline.
- The living map (`src/ui/map/MapLife.tsx`, `lifeDirector.ts`, `sprites.ts`) is presentation only. A pure director turns state and new log entries into short-lived pixel actors (trucks, protest crowds, blackouts, fireworks or rain, the oligarch limo), alongside ambient cows. It uses its own RNG, so the simulation and replays are untouched. Tune it in `config.life`. To add a sprite, add a string grid to `sprites.ts`; each character is a palette colour.

## Content: how to add …

All content is JSON in `data/`, and every text is a locale key whose Czech text lives in
`locales/cs.json`. The loader validates everything at startup and shows a readable Czech error screen
(with the file and JSON path) if something is wrong — e.g. an unknown budget chapter, a missing event, a
missing locale key, a broken upgrade DAG, seats not summing to 200.
**Do not invent placeholder content in code** — mark unfinished texts `[TODO]`.

### A policy card
Add an object to any file in `data/policies/` (one file per card or per leaning — both work):

```jsonc
{
  "id": "flat_tax_15",                         // unique, snake_case
  "leaning": "libertarianism",                 // fascism | communism | socialism | progressivism | libertarianism | conservatism | populism
  "availableFor": ["mupka", "abis"],           // a card for both leaders counts for both
  "title": "policy.flat_tax_15.title",
  "description": "policy.flat_tax_15.desc",
  "drivenBy": "policy.flat_tax_15.drivenBy",
  "effects": { "support": { "min": -3, "max": 2 }, "coalition": { "min": 4, "max": 6 } },
  "anger":   { "oligarchs": { "min": -12, "max": -8 }, "pensioners": { "min": 6, "max": 10 } },
  "ongoing": [{ "target": "support", "perDay": -0.05, "days": 180, "label": "policy.flat_tax_15.ongoing" }],
  "budgetChanges": [{ "chapter": "398", "type": "revenue", "changePct": -8 }],   // hidden; drives Finances
  "chaosEvents": ["flat_tax_15_chaos_1"],      // 0–3 event ids
  "devOnly": false
}
```
Then add the Czech texts to `locales/cs.json`:
`"policy.flat_tax_15.title": "…"`, `"policy.flat_tax_15.desc": "…"`, `"policy.flat_tax_15.drivenBy": "…"`, `"policy.flat_tax_15.ongoing": "…"`.

- Finances are normally **not** in `effects`: they come from `budgetChanges` (`changePct` is % of the original value; changes add up, they never compound; `"chapter": "*"` = every chapter). An optional `"financesExtra": {min,max}` adds a non-budget finance effect.
- `ongoing.target` is a resource (`support`, `coalition`, `prestige`, `finances`) or an anger meter (`anger.media`).
- Content target: ≥ 20 cards per leader. The loader warns under 18 non-filler cards per leader and refuses to start under 3.

### A regional compromise ("Učinit kompromis")
Compromises are their own decision, never mixed with policy cards. In a quarter where it happens
(`config.compromise.chance`), the game pauses on `config.compromise.day` and offers two compromise cards
against each other; the player must make one. They focus on regional politics: support rises in some
kraje and falls in others, or regional support is traded for the Oligarchs' favour or for Finances. Add
to any file in `data/compromises/`:

```jsonc
{
  "id": "rail_hub_brno",                        // unique across policies AND compromises
  "availableFor": ["mupka", "abis"],
  "title": "compromise.rail_hub_brno.title",
  "description": "compromise.rail_hub_brno.desc",
  "drivenBy": "compromise.rail_hub_brno.drivenBy",
  "regions": {                                  // required: support shift per kraj (NUTS3 code)
    "CZ064": { "min": 5, "max": 8 },
    "CZ080": { "min": -4, "max": -2 }
  },
  "anger": { "oligarchs": { "min": -6, "max": -3 } },                    // optional, like cards
  "budgetChanges": [{ "chapter": "327", "type": "expenditure", "changePct": 6 }],  // optional
  "chaosEvents": [],
  "devOnly": false
}
```
No `leaning`: compromises are not weighted by the leader's leanings. Every effect block that cards use
(`effects`, `anger`, `ongoing`, `budgetChanges`) also works here, and any other bundle (cards, events,
responses, opportunities, budget options) may also use `regions`.

Regional support is `national support + offset + shift`. Each run starts with a small seeded jitter per
kraj (`config.regions.startJitter`, re-centred so the national average is unchanged).

### A chaos event (and responses)
Add to any file in `data/events/`:

```jsonc
{
  "id": "flat_tax_15_chaos_1",
  "chance": 0.35,                               // 35 %
  "quarterOffset": 0,                           // 0 = same quarter as the pick, up to 3
  "window": { "fromDay": 10, "toDay": 80 },     // day within that quarter (1–91)
  "text": "event.flat_tax_15_chaos_1.text",
  "effects": { "support": { "min": -6, "max": -3 } },
  "anger":   { "media": { "min": 4, "max": 8 } },
  "responses": null
}
```
To make it **respondable** (about 1 in 3 events), replace `"responses": null` with:

```jsonc
"responses": {
  "default": "ignore",                         // applied when the 12 s countdown runs out; must cost 0 PC
  "options": [
    { "id": "deny",      "label": "event.flat_tax_15_chaos_1.resp.deny",      "cost": { "pc": 0 },
      "effects": { "support": { "min": -2, "max": 0 } }, "anger": { "media": { "min": 3, "max": 5 } } },
    { "id": "apologise", "label": "event.flat_tax_15_chaos_1.resp.apologise", "cost": { "pc": 1 },
      "effects": { "coalition": { "min": -3, "max": -1 } } },
    { "id": "ignore",    "label": "event.flat_tax_15_chaos_1.resp.ignore",    "cost": { "pc": 0 } }
  ]
}
```
The event's base effects apply when it fires; the chosen response's effects are added on top.

### An opportunity
Add to any file in `data/opportunities/`:
```jsonc
{ "id": "opp_ribbon_cutting", "weight": 3, "text": "opportunity.ribbon_cutting.text",
  "reward": { "pc": 1, "effects": { "support": { "min": 1, "max": 2 } } } }
```
`weight` 1 = rare, 3 = common. Rewards use the same effect format as cards (plus `pc`).

### A budget-vote option
Edit `data/annual/budget_vote.json` (same effect format as cards, plus `passChanceMod`, `label`, `description`):
```jsonc
{ "id": "budget_tight", "label": "budgetVote.budget_tight.label", "description": "budgetVote.budget_tight.desc",
  "passChanceMod": -0.10, "effects": { "support": { "min": -4, "max": -2 } },
  "anger": { "pensioners": { "min": 4, "max": 8 } },
  "budgetChanges": [{ "chapter": "*", "type": "expenditure", "changePct": -3 }] }
```

### Other data
| File | Contents |
|---|---|
| `data/leaders.json` | leaders: start values, start anger, leaning weights, party colour, ability (modifiers + instant bundle) |
| `data/regions.json` | 14 kraje: seats (must sum to 200; **PLACEHOLDER** until replaced with volby.cz values), per-leader `offsets`, election-night `revealOrder` |
| `data/endings.json` | interest-group endings; set `"built": true` and write the texts to enable one of the other four |
| `data/upgrades/*.json` | upgrade trees: nodes with cost, `requires`, modifiers, grid `pos` |

## Replace the budget data

`data/budget.json` is **MOCK DATA** (round numbers, deficit ≈ 148 bn CZK). To use the real Monitor –
Státní pokladna export, replace the file with the same structure — **no code changes needed**:

```jsonc
{ "source": "Monitor – Státní pokladna", "year": 2026, "currency": "CZK",
  "chapters": [ { "code": "313", "name": "Ministerstvo práce a sociálních věcí", "revenue": 0, "expenditure": 0 } ] }
```
- Values are in CZK. Chapter `name` is for developers only and is never shown to the player.
- Every chapter code used by cards, events, responses and budget-vote options must exist (or be `"*"`); the loader reports any that don't.
- The "MOCK DATA" badge disappears automatically when `source` is anything else.
- If the real dataset's fields differ, only `src/data/schemas.ts` (`budgetSchema`) and the loader need to change.
- `config.finances.scale` controls how strongly the balance moves Finances; rebalance with the simulator afterwards.

## Filler content

Until there are real cards, `scripts/gen-filler-cards.ts` generates 22 labelled `[FILLER]` cards per
leader (+ one filler event each, ~1/3 respondable) into `data/policies/_filler.json` and
`data/events/_filler.json`, and writes their `[FILLER]` locale keys. Files whose name starts with `_` are
filler.

- Regenerate: `npm run gen:filler` (seeded and deterministic; bounds in `config.filler`).
- Turn off once real content meets the minimum: set `includeDevFiller: false` in `src/config.ts`.

## Simulator

```bash
npm run simulate -- --runs 500 --bot greedy --leader both --difficulty normal --seed sim
npm run simulate -- --runs 2000 --bot both --difficulty all     # full matrix
npm run simulate -- --runs 200 --json                            # machine-readable
```
Prints win rate, average run length (quarters), average score and how often endings, snap elections and
draft-pool relaxation happened. Bots: `random` (random picks/responses, collects pins with p = 0.5) and
`greedy` (best expected re-election probability after immediate effects, cheapest upgrade, all pins,
ability when useful). Targets on Normální: random ≤ 15 %, greedy 20–40 % (`config.simulatorTargets`).

`npm run analyze -- --runs 300 --set drift.support=-0.06 --leader abis.start.support=45` prints average
end-of-run state with config / leader overrides applied in memory only — handy for balancing.

## Tunables

Every number lives in **`src/config.ts`**: time (91-day quarters, 0.7 s per day at 1×, speeds), drift,
anger decay and warning thresholds, zero-resource penalties and the Isolation cap, election model
(`k`, regional noise, seats per point, group weights), finance scale, budget vote (day, mandatory growth,
pass chance, failure effects), draft and reroll costs ([OPEN] currency: PC), PC income, ability recharge,
pop-up timing, opportunity pins, score weights, difficulty presets, filler-generator bounds and simulator
targets. Leader-specific values are data (`data/leaders.json`).

## Map attribution

Region boundaries: © EuroGeographics for the administrative boundaries (Eurostat GISCO, NUTS 2021,
1:3 million). Downloaded once at build time by `scripts/build-map.ts` (cached in `.map-cache/`),
projected and quantised into `src/ui/map/regionsPath.ts`. The attribution is also shown under the map in
the game. If the download is unavailable, the script writes a schematic placeholder map instead.

## Satire guardrail

Real politicians appear only under parody names (Kartin Mupka, Bander Abis, Lursula von der Eyen). No
real names or likenesses in the repo; the placeholder pixel sprites are generic caricatures.
