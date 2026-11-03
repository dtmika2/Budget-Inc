# Budget Inc. — One-Pass Build Plan for Claude Code

> **What this is:** the execution plan for building the whole Proof of Concept in a single autonomous session.
> **Source of truth:** `budget-inc-spec.md` (v1.1). This plan says **in what order** and **how to verify**; the spec says **what**. If they disagree, the spec wins, and you record the conflict in `DECISIONS.md`.
> **Also read:** `budget-inc-brief.md` for tone and context.

---

## 0. How to work in this session

### 0.1 Autonomy rules
1. **Do not stop to ask questions.** When something is ambiguous, pick the most reasonable option that fits the spec, implement it behind a config value if it is a number, and add one line to `DECISIONS.md` (`- §ref — decision — why`). Continue.
2. **Stop only if** a phase gate (§0.3) still fails after 3 honest fix attempts, or a required tool cannot be installed. Then write the blocker to `DECISIONS.md` under `## Blockers`, finish every phase that does not depend on it, and report.
3. **Never invent game content** (policy, event, ending or opportunity texts). Use `[DUMMY]`, `[FILLER]` or `[TODO]` exactly as spec §11 says.
   - UI chrome (buttons, menu items, labels, resource names, tutorial headings) **is** written in Czech in `locales/cs.json`. That is interface text, not content.
4. **Satire guardrail:** only the parody names (Kartin Mupka, Bander Abis, Lursula von der Eyen). No real names anywhere in the repo.
5. **No Czech strings in `src/`.** Every player-facing string goes through `t('key')`.
6. **No network calls at runtime.** The only allowed build-time download is the map boundary file (§P1.4), with a fallback.
7. Commit after every phase with a message `phase N: <summary>`.

### 0.2 Working log
Keep two files at the repo root up to date as you go:
- `DECISIONS.md` — every decision you made that the spec did not dictate, plus blockers.
- `PROGRESS.md` — a checklist of the phases below; tick each one when its gate passes.

### 0.3 Phase gate (run at the end of every phase)
```
npm run typecheck   # tsc --noEmit, zero errors
npm run lint        # zero errors (warnings allowed)
npm test            # all tests green
npm run build       # vite build succeeds
```
From phase 5 on, also run `npm run simulate -- --runs 200 --bot random` and check that it finishes without exceptions.

A phase is done only when its gate passes **and** its "Done when" list is true.

---

## 1. Stack and dependencies

| Purpose | Choice |
|---|---|
| Language / build | TypeScript (strict), Vite |
| UI | React 18 |
| State bridge | `useSyncExternalStore` over the core's subscribe API (no Redux/Zustand) |
| Data validation | `zod` |
| Tests | `vitest` |
| Scripts | `tsx` |
| Lint | `eslint` with `typescript-eslint`, plus a custom rule or test that fails on Czech diacritics in `src/**` |
| Map build (dev only) | `d3-geo`, `topojson-client`/`topojson-simplify` or `mapshaper` — whatever installs cleanly |

`package.json` scripts: `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `simulate`, `gen:filler`, `build:map`.

---

## 2. Repository layout

```
/
├─ CLAUDE.md                     # short rules for future sessions (see P0)
├─ README.md
├─ DECISIONS.md
├─ PROGRESS.md
├─ index.html
├─ data/
│  ├─ budget.json                # MOCK
│  ├─ regions.json               # PLACEHOLDER seats, offsets, reveal order
│  ├─ leaders.json
│  ├─ endings.json
│  ├─ annual/budget_vote.json
│  ├─ policies/dummy.json        # 6 [DUMMY] cards
│  ├─ policies/_filler.json      # generated [FILLER] cards
│  ├─ events/dummy.json          # 4 [DUMMY] events (+ filler events)
│  ├─ events/_filler.json
│  ├─ opportunities/dummy.json   # 3 [DUMMY]
│  └─ upgrades/support.json
├─ locales/cs.json
├─ public/sprites/               # placeholder sprites (generated or CSS)
├─ scripts/
│  ├─ gen-filler-cards.ts
│  ├─ build-map.ts
│  └─ simulate.ts
└─ src/
   ├─ config.ts                  # every tunable + difficulty presets
   ├─ core/                      # PURE TS. No DOM, no React, no Date.now(), no Math.random()
   │  ├─ types.ts
   │  ├─ rng.ts                  # seeded PRNG + named streams
   │  ├─ modifiers.ts            # pipeline §4.8
   │  ├─ effects.ts              # roll + apply effect bundles
   │  ├─ budget.ts               # changePct model, finances §9.3
   │  ├─ draft.ts                # §5.3
   │  ├─ scheduler.ts            # generic timed entries
   │  ├─ chaos.ts                # §7.1, §7.3
   │  ├─ opportunities.ts        # §7.4
   │  ├─ budgetVote.ts           # §4.7
   │  ├─ upgrades.ts             # §8
   │  ├─ abilities.ts            # §5.2
   │  ├─ penalties.ts            # §4.4
   │  ├─ endings.ts              # §4.5
   │  ├─ election.ts             # §4.6
   │  ├─ score.ts                # §4.9, §10.3
   │  ├─ log.ts                  # §10
   │  ├─ simulation.ts           # Simulation class: tick(), dispatch(input)
   │  └─ replay.ts
   ├─ data/                      # loaders + zod schemas + cross-file validation
   ├─ i18n/                      # t(), key typing, missing-key check
   ├─ ui/
   │  ├─ App.tsx, store.ts, clock.ts (rAF loop)
   │  ├─ screens/  MainMenu, LeaderSelect, Game, FinalScreen, DataError
   │  ├─ hud/      TopBar, ResourceBar, ProjectionBadge, SpeedControls
   │  ├─ map/      CzMap, regionsPath.ts (generated), OpportunityPin
   │  ├─ panel/    SidePanel, AngerMeters, ActiveEffects, History
   │  ├─ modals/   DraftModal, PolicyCard, BudgetVoteModal, UpgradeTree,
   │  │            PauseMenu, Settings, EndingCard, ElectionNight
   │  ├─ popups/   PopupStack, NewsPopup, ResponsePopup
   │  ├─ tutorial/ Tutorial, coachMarks.ts
   │  └─ styles/
   └─ main.tsx
└─ tests/ (or src/**/*.test.ts)
```

---

## 3. Core design (decide once, use everywhere)

### 3.1 Key types (sketch — refine in `types.ts`)
```ts
type ResourceId = 'finances' | 'support' | 'coalition' | 'prestige';
type GroupId = 'oligarchs' | 'pensioners' | 'media' | 'eu' | 'activists';
type Range = { min: number; max: number };

interface EffectBundle {
  effects?: Partial<Record<ResourceId | 'financesExtra', Range>>;
  anger?: Partial<Record<GroupId, Range>>;
  ongoing?: OngoingDef[];          // target: ResourceId | `anger.${GroupId}`
  budgetChanges?: BudgetChange[];  // chapter code or '*'
  pc?: number;
}

interface Modifier {
  type: 'add' | 'multiplier';
  target: string;                  // grammar from spec §4.8
  value: number;
  source?: 'policy'|'chaos'|'response'|'opportunity'|'budget_vote'|'ongoing'|'drift'|'penalty'|'any';
  days?: number;                   // undefined = permanent
  origin: string;                  // e.g. 'upgrade:sup_press_office' (for the panel)
}

type Input =
  | { kind: 'pickPolicy'; cardId: string }
  | { kind: 'reroll' }
  | { kind: 'respond'; eventInstanceId: string; responseId: string; timedOut: boolean }
  | { kind: 'collectOpportunity'; pinId: string }
  | { kind: 'voteBudget'; optionId: string }
  | { kind: 'buyUpgrade'; nodeId: string }
  | { kind: 'useAbility' };

type Phase = 'running' | 'draft' | 'budgetVote' | 'ending' | 'election' | 'finished';
```

### 3.2 Simulation API
```ts
class Simulation {
  constructor(data: GameData, config: Config, opts: { seed: string; leader: LeaderId; difficulty: DifficultyId });
  readonly state: GameState;          // treat as read-only outside core
  tick(): void;                       // advance exactly one day (only when phase === 'running')
  dispatch(input: Input): void;       // validates, applies, logs (with current day)
  preview(cardOrOption): PreviewRanges; // ranges after modifiers, for cards/vote/responses
  subscribe(fn): () => void;
}
```
- Every `dispatch` is appended to `state.inputs` with its day; `replay(log)` rebuilds a `Simulation` from `run_started` data and re-feeds inputs at their days. Test that final states match.
- The UI owns **real time** only: the rAF clock calls `tick()` (`msPerDay = 700 / speed`, accumulator, max 4 ticks per frame) and the response countdowns. When a countdown ends, the UI dispatches `respond` with `timedOut: true`.

### 3.3 RNG
- `sfc32` or `mulberry32` seeded from a string hash.
- Named streams: `draft`, `effects`, `chaos`, `opportunities`, `budgetVote`, `election`, `filler` — each its own generator derived from `hash(seed + ':' + name)`.

### 3.4 Order inside one `tick()` (day d of quarter q)
Spec does not fix this; use this order and record it in `DECISIONS.md`:
1. Fire scheduled entries for this day, in order: budget vote (opens modal → phase `budgetVote`, stop the tick here), chaos events, pin spawns, pin expiries.
2. Apply daily changes: drift → ongoing effects → zero-penalty effects → anger decay. Decrement durations of ongoing effects and timed modifiers; drop expired ones.
3. Recompute Finances (§9.3).
4. Update zero-penalty state (start at 0, end at `zeroPenaltyExitAt`), log transitions.
5. Check endings: built ending at 100 → phase `ending`. Then Coalition at 0 → snap election. (Ending wins if both happen on the same day.)
6. Every 7th day: update the displayed projection and the trend history.
7. If d is the last day of the quarter: q < 16 → start the next quarter (PC grant, ability recharge on quarters 5/9/13, cancel nothing, open draft → phase `draft`). q = 16 → cancel remaining schedule, phase `election`.

### 3.5 Effect application (spec §4.8)
One function `applyBundle(bundle, source, origin)` used by **every** source. It rolls with the `effects` stream, runs each value through the modifier pipeline, clamps, applies `budgetChanges` through `budget.ts` (scaling worsening changes by `finances.negative` modifiers), registers ongoing effects, logs rolled values. `preview()` runs the same pipeline on `min` and `max` without rolling.

---

## 4. Phases

Each phase lists its tasks, then **Done when**. Run the phase gate (§0.3) before moving on.

### P0 — Scaffolding
- Vite + React + TS strict project; install deps; scripts from §1.
- ESLint config, Vitest config, `tsconfig` path alias `@core`, `@ui`, `@data`.
- `CLAUDE.md` with the rules from §0.1 (short, 15 lines max) and pointers to the spec and this plan.
- `DECISIONS.md`, `PROGRESS.md` (copy the phase list).
- Test that fails if any file in `src/` contains Czech diacritics (`/[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/`).

**Done when:** gate passes; `npm run dev` shows an empty app shell.

### P1 — Data layer and seed data
1. **Zod schemas** for every file in spec §13 table. Cross-file validation: chapter codes exist (or `'*'`), event ids referenced by cards exist, leader ids valid, upgrade prerequisites exist and form a DAG, every locale key referenced by data exists in `cs.json`, regions sum to 200 seats, reveal order lists all 14 codes once. Card count per leader: warn under 18 non-filler, error under 3.
2. **Loader** returns `GameData` or a list of readable errors; `DataError` screen shows them (in Czech via keys, plus raw file/path detail).
3. **`data/budget.json` (MOCK):** `"source": "MOCK DATA"`, currency CZK, values in CZK (bn × 1e9). Use these round numbers (deficit ≈ 148 bn):

   | code | name (dev only) | revenue (bn) | expenditure (bn) |
   |---|---|---|---|
   | 398 | Všeobecná pokladní správa | 1650 | 700 |
   | 313 | Ministerstvo práce a sociálních věcí | 680 | 1050 |
   | 333 | Ministerstvo školství, mládeže a tělovýchovy | 20 | 270 |
   | 307 | Ministerstvo obrany | 5 | 165 |
   | 327 | Ministerstvo dopravy | 15 | 125 |
   | 314 | Ministerstvo vnitra | 10 | 90 |
   | 329 | Ministerstvo zemědělství | 10 | 70 |
   | 315 | Ministerstvo životního prostředí | 15 | 40 |
   | 312 | Ministerstvo financí | 5 | 30 |
   | 335 | Ministerstvo zdravotnictví | 2 | 20 |

4. **`data/regions.json`:** `"seatsSource": "PLACEHOLDER — replace with volby.cz"`; placeholder seats summing to 200: CZ010 24, CZ020 26, CZ031 13, CZ032 11, CZ041 5, CZ042 14, CZ051 8, CZ052 10, CZ053 10, CZ063 10, CZ064 23, CZ071 12, CZ072 11, CZ080 23. Offsets 0 for both leaders. Reveal order: smallest regions first, Praha and Moravskoslezský last.
5. **`leaders.json`, `upgrades/support.json`, `endings.json`, `annual/budget_vote.json`** from spec tables (§5, §8.3, §4.5, §4.7) with `[DUMMY]` texts where content is missing.
6. **Dummy content** exactly as spec §11 (6 cards, 4 events with ≥ 1 respondable, 3 opportunities).
7. **`scripts/gen-filler-cards.ts`:** seeded; ≥ 22 cards per leader across all 7 leanings (roughly following leaning weights), each with 1–2 budget changes on mock chapters, 2–3 resource ranges, 1–3 anger ranges, ~30 % with an ongoing effect, each referencing 1 generated filler event (~1/3 respondable). Ranges are drawn from config bounds so filler is roughly balanced: most cards net-neutral, trade-offs between groups. Writes `_filler.json` files and the matching `[FILLER]` locale keys into `cs.json`. All marked `devOnly: true`.
8. **`locales/cs.json`:** UI chrome in Czech (menus, resources, groups, leanings, buttons, election night, final screen, settings, tutorial headings with `[TODO]` bodies), plus content keys.
9. **i18n:** `t(key, params?)`; in dev, a missing key renders `⟦key⟧` and logs once.

**Done when:** loader validates all shipped data; tests cover one valid fixture and ≥ 5 invalid fixtures (bad chapter, missing event, broken DAG, seats ≠ 200, missing locale key).

### P1.4 — Map (can run in parallel with P1)
- `scripts/build-map.ts`: download GISCO NUTS3 (2021, 1:20M, EPSG:4326 GeoJSON) **once at build time**, keep `CNTR_CODE === 'CZ'`, project (equirectangular with cos(49.8°) scaling or `geoMercator` fitted to the viewBox), simplify, write `src/ui/map/regionsPath.ts` (`{ code, d, labelX, labelY }[]`) and add the attribution string to the README and an in-game "about" line.
- **Fallback if the download is blocked:** generate a schematic map (14 rounded shapes placed roughly by geography with correct NUTS codes), mark it `SCHEMATIC PLACEHOLDER` in the file and `DECISIONS.md`. Do not stall on this.

**Done when:** `regionsPath.ts` exists with all 14 codes.

### P2 — Core simulation
Implement `rng`, `modifiers`, `effects`, `budget`, `scheduler`, `penalties`, `simulation` (tick order §3.4), drift, ongoing effects, anger decay, trend history, log, `config.ts` with **every** tunable from the spec and the 3 difficulty presets.

Tests:
- RNG streams are independent and reproducible.
- Modifier pipeline: order (roll → negative multiplier → add → multiply → clamp), source filtering, durations, `finances.negative`.
- Budget: `changePct` additive vs original, `'*'` chapter, floor at 0, finances formula, mandatory growth.
- Zero penalties: start/exit hysteresis, isolation accumulation and cap.
- Anger decay toward resting value, not applied at 100.

**Done when:** a headless `Simulation` can run 1,456 ticks with no inputs (auto-pick first card in drafts via a test helper) without errors.

### P3 — Leaders, abilities, draft, PC
- `abilities.ts` (charges, recharge on Q5/9/13, Austerity Freeze as modifier, Campaign Mode as bundle).
- `draft.ts` exactly per spec §5.3 including the 3 relaxation levels and `pool_relaxed` logging.
- Rerolls with escalating cost (reset per quarter), PC income (+2, +1 if support ≥ 60, `pc.perQuarter` modifiers).
- `preview()` for cards.

Tests: weighting matches leaning weights within tolerance over 10k draws (renormalised over available leanings); no duplicates in a hand; each relaxation level triggers with a tiny pool; a 16-quarter run with 18 cards never relaxes without rerolls; reroll cost curve.

### P4 — Chaos, responses, opportunities, budget vote, upgrades
- `chaos.ts`: schedule on pick (`chance × multiplier`, `quarterOffset`, window), fire, respondable instances with `default`, `scheduled_cancelled` handling.
- `opportunities.ts`: spawn per quarter weighted by `w_r`, lifetime, collect, expire.
- `budgetVote.ts`: day 75 of Q1/5/9/13, mandatory growth before the vote, `p_pass`, pass/fail branches.
- `upgrades.ts`: generic DAG engine (owned/available/locked), buy → modifiers. Support branch from data.

Tests: chaos fires at the expected rate over many seeds; response default applies; unaffordable responses rejected; pins expire; budget vote pass probability; each Support upgrade changes the right numbers (including card preview ranges).

### P5 — Endings, election, score, replay, simulator
- `endings.ts`: data-driven; Oligarchs built; stand-in penalty for the other 4.
- `election.ts` exactly per spec §4.6 (logistic swing, regional noise, `G`, D'Hondt-style split with caps).
- `score.ts`: score formula, key decisions (impact ranking).
- `replay.ts` + test: random-input run → export log → replay → identical final state and score.
- `scripts/simulate.ts`: `--runs --bot random|greedy --leader mupka|abis|both --difficulty --seed`; prints win rate, avg run length (quarters), avg score, ending/snap/relaxation frequencies. Greedy bot as spec §13.

Tests: over 20k seeds empirical win rate ≈ `P` (±1.5 pp); seats always sum to `G`; `G ≥ 101` ⇔ win; snap election uses current state; Oligarchs ending fires at exactly 100.

**Done when:** gate passes and `npm run simulate -- --runs 500 --bot greedy` runs.

### P6 — UI shell and HUD
- `store.ts` (subscribe bridge), `clock.ts` (rAF, speeds, auto-pause on modal/blur/visibility change).
- Screens: MainMenu, LeaderSelect (with difficulty and best scores), Game, DataError.
- TopBar (4 bars with numeric value on hover/tap, PC, date `Q3 / rok 1 · 14. 8.`, speed controls, pause menu button, projection badge), mock-data badge when `source === 'MOCK DATA'`.
- CzMap: regions tinted red → party colour by `s_r`; tap shows region name, support, seats/coefficient.
- SidePanel/drawer: anger meters (≥70 pulse, ≥90 one-time warning with re-arm below 80), trend arrows, active effects with days left, history list.
- Placeholder leader sprites (coloured block + initials, pixelated) with ability button and charge state.
- `?debug=1` overlay: chapter table, revPct/expPct, balance, finances terms, seed, current phase.

### P7 — Modals and pop-ups
- DraftModal + PolicyCard (all fields from spec §6.3, ranges via `preview()`, ongoing icon, never chapter names), reroll button with cost, mobile carousel.
- Floating numbers on bars/meters after any applied bundle (disabled with reduced motion).
- PopupStack: news pop-ups (auto-dismiss 5 s), ResponsePopup (buttons with ranges/cost, 12 s countdown that pauses with the game), stacking limits 3/2, priority for respondable.
- OpportunityPin on the map (≥ 44 px), expiry animation.
- BudgetVoteModal (3 options, ranges, pass chance), result pop-up.
- UpgradeTree (node graph, states, details, buy).

### P8 — Endings, election night, final screen, meta
- EndingCard (art placeholder, text key, continue → FinalScreen).
- ElectionNight: regions light up in reveal order (~1.2 s each, skippable), per-region `s_r_final` and seats, running total toward 101 line, outcome reveal.
- FinalScreen: outcome, score, best score (localStorage per leader+difficulty), resources and meters, key decisions, Export JSON (download `budget-inc-<runId>.json`), Play again, Main menu.
- PauseMenu (with confirmations), Settings (default speed, reduced motion, reset tutorial), `beforeunload` warning during a run.
- Tutorial: ~6 coach marks in Q1, skippable, localStorage flag.

### P9 — Balance pass
1. Run `simulate --runs 2000` for each leader × bot on Normální.
2. Targets (spec §13): random ≤ 15 % wins, greedy 20–40 % wins, both leaders within 10 pp of each other for greedy, average run length close to 16 quarters for greedy (endings are rare but possible).
3. Change **only `config.ts` values** (and filler generator bounds). Up to 6 iterations. Log each iteration's numbers in `DECISIONS.md` under `## Balance log`.
4. Check Snadná/Brutální move win rates in the expected direction.
5. Note in `DECISIONS.md` that balance is provisional because filler cards stand in for real content.

### P10 — Mobile, performance, README, final check
- Mobile pass at 375×667 and 390×844: no horizontal scroll, drawer works, carousel works, all targets ≥ 44 px, pop-ups don't cover the draft.
- Performance: no React re-render of the whole tree per tick (subscribe by slice / memoise); map regions re-tint only weekly. Check ≥ 30 fps at 4× in Chrome devtools mobile emulation if a browser is available; otherwise note it in `DECISIONS.md`.
- README: run, build, deploy to static hosting, add a card / event / response / opportunity / budget-vote option, replace budget data, regenerate filler and turn it off, run the simulator, where tunables are, map attribution.
- Walk through spec §15 acceptance checklist; mark each item in `PROGRESS.md` as ✅ or ❌ with a reason.

**Done when:** all gates pass and the final report (§5) is written.

---

## 5. Final report (end of session)
Print in the chat and save as `PROGRESS.md` final section:
- acceptance checklist status (spec §15)
- simulator results table (leader × bot × difficulty)
- list of decisions made (link to `DECISIONS.md`)
- blockers and anything left as placeholder (map, seats, content)
- how to run it: `npm install && npm run dev`

---

## 6. Kickoff prompt (paste into Claude Code)
```
Read budget-inc-spec.md, budget-inc-brief.md and budget-inc-build-plan.md in full.
Build the complete Budget Inc. PoC in this session by following the build plan
phase by phase (P0 → P10). Follow §0 of the plan: work autonomously, do not ask
questions, record decisions in DECISIONS.md, run the phase gate after every
phase, and commit after each phase. Finish with the final report from §5.
```
