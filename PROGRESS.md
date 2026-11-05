# Progress

- [x] P0 — Scaffolding
- [x] P1 — Data layer and seed data
- [x] P1.4 — Map
- [x] P2 — Core simulation
- [x] P3 — Leaders, abilities, draft, PC
- [x] P4 — Chaos, responses, opportunities, budget vote, upgrades
- [x] P5 — Endings, election, score, replay, simulator
- [x] P6 — UI shell and HUD
- [x] P7 — Modals and pop-ups
- [x] P8 — Endings, election night, final screen, meta
- [x] P9 — Balance pass
- [x] P10 — Mobile, performance, README, final check
- [x] P11 — Budget sliders, presets and coalition red lines
- [x] P12 — Compromise channels and mini-games
- [x] P13 — Region screen, traits and history
- [x] P14 — Regional demands ("!") and pledges
- [x] P15 — Region events (second map layer) and the tabbed region screen
- [x] P16 — Budget vote: hand of 6 categories with re-roll, safe bands, zones and advisors
- [x] P17 — Three once-per-game abilities per leader with pixel icons
- [x] P18 — Calm budget-vote layout
- [x] P19 — Stable top bar with resource details, one hover card, 3 region events a year
- [x] P20 — Left panel without scrolling, one colour palette, quiet clickable pop-ups
- [x] P21 — Slim top bar, compact timeline, Vylepšení in leader colours
- [x] P22 — Full-page draft, effects as three lanes on policy cards
- [x] P23 — Budget vote in three columns: sliders, chamber estimate + live advisor commentary (why + recommendations), impact lanes
- [x] P24 — Stakeholder feedback, block 1: interest groups drain attributes (shown on hover), prestige bonuses, Abis abilities reworked
- [x] P25 — Policy cards show today → after for every value; status strip above the draft
- [x] P26 — Kraj actions (pick where to work: 2–4 actions per kraj for Finance / PC), region events 3 → 1 a year
- [x] P27 — Budget areas: every area moves ≥2 resources and ≥2 groups, much bigger effects; light budget commentary (one sentence, no recommendations); balance target ≥33 % for both leaders
- [x] P28 — Policy cards: draft under the top bar, distinct leaning colours, corner details, whole card visible on phones
- [x] P29 — Skill tree rework: active abilities (kraj / group targets, cooldowns), stronger passives, new texts; tree with tinted quadrants and a fixed description panel

Every phase gate passed (`typecheck`, `lint`, `test` — 98 tests, `build`, and from P5 on `simulate --runs 200 --bot random`).

---

# Final report

## Acceptance checklist (spec §15)

| | Item | Status | Evidence / reason |
|---|---|---|---|
| ✅ | A full 16-quarter run is playable on desktop and on a phone, and takes 15–20 min at 1× | ✅ | A full term was played in the real UI (Chrome, 1366×768, at 4×): 16 drafts, 4 budget votes, 48 pins, 6 upgrades, tutorial, election night, final screen, JSON export; zero console errors. At 1×, 1,456 days × 0.7 s = 17.0 min plus decision time. Phone layouts were checked in mobile emulation (375×667, 390×844); **not yet tested on a physical phone**. |
| ✅ | Both leaders selectable and play differently (start values, ability, draft mix); abilities recharge yearly | ✅ | Leader select shows both; tests cover Campaign Mode, Austerity Freeze, recharge at Q5/9/13, no stacking; draft weights per leader. |
| ✅ | 3 cards weighted by leader per quarter; reroll with escalating cost; a full run never fails to deal a hand | ✅ | Weighting within 1.5 pp over 10k draws; 3 relaxation levels tested; 1/2/4/8 cost reset per quarter. |
| ✅ | Picking a card changes resources and anger, changes budget chapters, recomputes Finances from data | ✅ | `applyBundle` + budget model tests; card Finances preview equals the applied delta; `?debug=1` overlay shows revPct/expPct and finance terms. |
| ✅ | Replacing `data/budget.json` with another valid file works without code changes | ✅ | Test loads an altered budget; data bundled via `import.meta.glob`. |
| ✅ | Chaos events fire as pop-ups and are logged; respondable events offer choices, time out to the default, are logged | ✅ | Core tests (rate, window, offset, default on timeout, unaffordable rejected) + UI-store test (countdown pauses with the game, timeout dispatches the default). |
| ✅ | Opportunity pins appear, can be collected and expire | ✅ | Tests for spawn window, seat-weighted regions, collect, expire; ≥ 44 px pins verified in the browser. |
| ✅ | Budget vote once per year, can pass or fail, applies mandatory spending growth | ✅ | Opens on day 75 of Q1/5/9/13 only; pass rate ≈ p_pass; fail branch; `*` budget changes; mandatory growth (halved by Austerity Freeze). |
| ✅ | Public Support tree can be bought; effects verifiably applied (incl. card ranges) | ✅ | Test per node: drift ×0.7, PC +1, media/pensioner anger gain ×0.75 in card previews, chaos support loss ×0.7, T −3. |
| ✅ | Oligarchs ending at 100 anger; Coalition 0 triggers a snap election | ✅ | Tests: fires at exactly 100 (also immediately on a pick), wins over a snap on the same day; snap uses the current state. |
| ✅ | Projection visible and updating; election night reveals regions one by one; seat total always agrees with the outcome | ✅ | Weekly projection in the HUD + map tint; 60k-seed test: win rate ≈ P (±1.5 pp), seats sum to G, G ≥ 101 ⇔ win; reveal verified in the browser. |
| ✅ | Every final screen shows score, best score and key decisions | ✅ | Verified for election win, election loss and Oligarchs ending (desktop + mobile). |
| ✅ | Tutorial runs on first run and can be skipped; difficulty presets work | ✅ | First run shows 6 coach marks (played through and skipped in browser checks); presets move win rates in the expected direction (see table). Tutorial bodies are `[TODO]` by design. |
| ✅ | Decision log complete, exportable as JSON, replays to the same final state | ✅ | Replay tests for random and greedy runs (deep-equal final state and score); export download verified in the browser. |
| ✅ | No Czech strings in code; no budget chapter names visible to the player | ✅ | Guard tests: no diacritics in `src/**`, every literal `t('…')` key exists, no UI file reads chapter names, no chapter name in `cs.json`. |
| ❌ | All tunables in config. Tests pass. **Simulator targets met on Normální.** README explains adding content and data | ❌ (partly) | Tunables in `src/config.ts` ✅, 98 tests pass ✅, README ✅. Simulator targets are met for **Kartin Mupka** but **not for Bander Abis** (random 43 %, greedy 90 %) and not for leader parity — caused by Abis's leader data (start support 55, Campaign Mode +10/yr), which config cannot offset. Measured proposal in `DECISIONS.md` → Balance log. |

## Simulator results (current config, seed "sim")

1000 runs per row (Normal rows re-run with 2000: random Mupka 0.9 %, random Abis 43.0 %, greedy Mupka 29.0 %, greedy Abis 90.0 %).

| bot | leader | difficulty | win rate | avg quarters | avg score | snap elections | endings |
|---|---|---|---|---|---|---|---|
| random | Mupka | Snadná | 10.7 % | 16.0 | 895 | 0.3 % | 0 % |
| random | Mupka | **Normální** | **1.0 %** | 13.6 | 600 | 69.1 % | 0 % |
| random | Mupka | Brutální | 0.1 % | 10.0 | 476 | 99.6 % | 0 % |
| random | Abis | Snadná | 93.3 % | 15.7 | 2008 | 12.1 % | 0 % |
| random | Abis | **Normální** | **43.8 %** | 13.1 | 1172 | 70.8 % | 0 % |
| random | Abis | Brutální | 13.0 % | 10.8 | 650 | 92.8 % | 0 % |
| greedy | Mupka | Snadná | 89.4 % | 16.0 | 2013 | 0.0 % | 0 % |
| greedy | Mupka | **Normální** | **29.7 %** | 15.4 | 1101 | 16.4 % | 0 % |
| greedy | Mupka | Brutální | 5.0 % | 14.1 | 672 | 50.1 % | 0 % |
| greedy | Abis | Snadná | 100.0 % | 16.0 | 2136 | 1.3 % | 0 % |
| greedy | Abis | **Normální** | **91.3 %** | 14.8 | 1912 | 34.7 % | 0 % |
| greedy | Abis | Brutální | 59.2 % | 12.3 | 1329 | 81.1 % | 0 % |

Targets (Normální): random ≤ 15 %, greedy 20–40 %. Draft-pool relaxation: 0 % in every row.

## Decisions
All decisions the spec did not dictate, the balance log and blockers: [`DECISIONS.md`](DECISIONS.md).

## Blockers and placeholders
- **No blockers.**
- **Content:** 6 `[DUMMY]` cards, 4 `[DUMMY]` events, 3 `[DUMMY]` opportunities, 3 `[DUMMY]` budget options; 44 generated `[FILLER]` cards + events (turn off with `includeDevFiller`). Ending texts and tutorial bodies are `[TODO]`.
- **Budget:** `data/budget.json` is MOCK DATA (badge shown in game).
- **Seats:** `data/regions.json` seats are PLACEHOLDER (replace from volby.cz); per-leader regional offsets are 0.
- **Map:** real GISCO NUTS 2021 boundaries (1:3M), not a placeholder.
- **Art:** leader sprites are code-drawn placeholder pixel caricatures; the ending art is a placeholder.
- **Balance:** provisional (filler content); Abis too strong under spec leader values — needs Daniel's call (proposal in DECISIONS.md).
- **Not verified:** play on a physical mid-range phone and real-device fps (emulation only).
- **[OPEN] items kept configurable:** reroll currency (PC), final upgrade currency, real budget fields, policy→chapter mapping.

## How to run
```bash
npm install && npm run dev
```
