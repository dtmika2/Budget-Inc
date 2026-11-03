# Decisions

Format: `- §ref — decision — why`. Every choice the spec did not dictate, plus blockers.

## Decisions
- plan §1 — Toolchain installed at current majors: TypeScript 6, Vite 8, Vitest 5, Zod 4, ESLint 10 (flat config), React 18.3 — plan fixes React 18; for the rest the latest versions installed cleanly.
- plan §0.1 — Czech-diacritics guard is a Vitest test (`tests/no-czech-in-src.test.ts`) rather than an ESLint rule — simpler, and it runs in the gate.
- plan §0.1 — ESLint forbids `Math.random`, `Date.now`, `window`, `document`, `localStorage` inside `src/core/` — enforces core purity mechanically.
- repo — `Gemini_Generated_Image_*.jpg` (a real politician's likeness) and `Mapa.png` (style reference) are left untracked and not used as assets — satire guardrail (no real likenesses); the map look borrows only the palette idea (dark ground, coloured regions, gold borders).
- P1.4 / spec §12.4 — Map built from GISCO NUTS3 2021 at **1:3M** (not 1:20M) and quantised to 0.1 px instead of per-region simplification — 1:20M has only 10–27 vertices per kraj (visibly crude); quantising keeps shared borders gap-free; the file is still small (23.5 KB). `npm run build:map -- --scale 20M` switches back. The download is cached in `.map-cache/` (gitignored).
- §9.2 — Data files are bundled by Vite (`import.meta.glob('data/**/*.json')`) at build time; the loader itself is environment-agnostic (`src/data/loader.ts`), with a Node adapter in `scripts/lib/nodeData.ts` — no runtime network calls; swapping `data/budget.json` needs only a rebuild, no code change.
- §11 — Filler content lives in files whose name starts with `_` (`_filler.json`); `config.includeDevFiller` decides whether such files are loaded.
- §6.2 — `effects.finances` in data is accepted as an alias of `effects.financesExtra` (normalised by the loader) — the card template in the brief lists "Finances" as a resource effect.
- §7.3 — The validator requires each event's `default` response to exist and to cost 0 PC — a timed-out response must always be applicable.
- §5.3 — Card-count check: warning when a leader has < 18 non-filler cards; error when it has < 3 cards in total (filler included, since filler makes runs possible).
- §4.5 — Ending texts are `[TODO]`; titles are `[TODO] Konec: <group>` — design intent exists in the spec, but final text is content.
- §11 — Dummy budget-vote labels are `[DUMMY] Úsporný/Vyrovnaný/Štědrý rozpočet` with numbers following the spec's design intent (tight −3 % all expenditure, balanced −1 %, generous +2 %).
- §12.3 — "Jak hrát" rules summary is written as UI chrome in `cs.json` (it explains mechanics, it is not game content); tutorial bodies stay `[TODO]` as the spec says.
- plan P1.7 — Filler generator: 22 cards per leader (one per leaning, the rest by leader weights), each with 2–3 resource ranges (one primary gain), 1–3 anger ranges (a trade-off), 1–2 budget changes sized to move Finances by 1–5 points, ~30 % ongoing, 1 filler event each (~1/3 respondable; option `c` = do nothing is the default).
- plan §3.4 — Tick order adopted exactly as plan §3.4: (1) scheduled entries for the day in the order budget vote → chaos → pin spawns → pin expiries; the budget vote stops the tick and the same day is re-processed (remaining entries) on the next tick; (2) drift → ongoing → zero penalties → stand-in penalties → anger decay, then durations; (3) Finances; (4) zero-penalty transitions; (5) built ending, then snap election; (6) every 7th absolute day projection + trend; (7) end of quarter.
- §4.1 — `tick()` processes the current day, then advances; day 1 of a quarter is processed after the draft pick, so a chaos window starting on day 1 still fires.
- §10.2 — Replay anchor is the count of effective ticks (`tickCount`) at the moment of each input, not the game day — several inputs can happen on the same day before/after its tick; the count is unambiguous.
- §10.1 — Log `timestamp`: each entry has the in-game `date` plus `wallTime` from a host-injected clock (`0` headless); replay comparison ignores `wallTime`. `runId` is derived from the seed (the UI generates the seed randomly).
- §4.8 — Drift skips the global negative multiplier (difficulty already has a drift multiplier) but matches `<res>.drift` and, with source filter `drift`, `<res>.loss/gain` modifiers.
- §4.8 — Anger decay (memory fades) is a system mechanic and bypasses the pipeline (no negative multiplier, no modifiers).
- §4.8 / §9.3 — A worsening budget change (revenue down / expenditure up) is "bad for Finances": its changePct gets the global negative multiplier and every `finances.negative`/`finances.loss` multiplier; additive modifiers are ignored for percentages. Mandatory growth goes through the same path (so Austerity Freeze halves it).
- §4.8 — A zero raw value is not changed by additive modifiers (a missing effect stays missing).
- §4.5 / §4.4 — Endings and the snap election are also checked right after every dispatch (not only in the tick), so a card that pushes Oligarchs to 100 ends the run immediately.
- §4.4 — "Reaches 0" is tested with a 1e-9 tolerance (values are clamped, so they hit 0 exactly in practice).
- §4.9 — `quartersCompleted` counts fully finished quarters: 16 after a normal term, `q − 1` after a snap election or ending in quarter q.
- §5.2 — New modifier source `ability` (spec's list has no source for abilities); `any` modifiers still apply.
- §8.1 — Starting PC is 0 (`config.pc.start`); Q1 grants +2 like every other quarter. PC income rounds to whole points.
- §3.1 — `Phase` keeps `finished` in the type for future use; the core ends in `ending` or `election` with the result and score already computed, and the UI presents election night / final screen.
- §10.1 — Extra log types beyond the spec table: `quarter_started` (PC gained), `opportunity_spawned`, `mandatory_growth`, `budget_vote_opened`, `ability_recharged` — useful for analytics, cheap.
- plan §2 — Core modules P2–P5 were written together because `simulation.ts` wires all of them; each phase commit adds that phase's tests and fixes.
- §5.3 — Relaxation level 2 is used only once never-picked cards are exhausted; it then takes the card with the oldest last pick (deterministic, no weighting). Levels 1 and 3 keep the weighted leaning draw. A hand stays at the highest level it reached; `pool_relaxed` is logged once per hand with that level.
- §5.3 — If all available leanings have weight 0, leanings are drawn uniformly (avoids a dead draft).
- §5.2 — Abilities can be used while the game runs or during the draft (not during the budget vote / after the run).
- §6.1 — Rerolls: cost = `rerollBaseCost × rerollCostFactor^n` (1, 2, 4, …) in PC (`config.draft.rerollCurrency`, [OPEN]); the counter lives in the per-quarter draft state, so it resets each quarter.
- §7.1 — A chaos event's chance is capped at 1 after the difficulty multiplier; its `quarterOffset` is capped at `config.chaos.maxQuarterOffset` (3).
- §7.3 — Responses are accepted in any non-terminal phase (the countdown only runs while unpaused, but a click on a visible pop-up is honoured); a timed-out response always applies the event's `default`, whatever `responseId` was sent.
- §7.4 — Pin day, region (weighted by seats = w_r) and reward (weighted by `weight`) are all drawn at quarter start from the `opportunities` stream; the reward is revealed on tap. A pin's lifetime is counted in absolute days, so a pin spawned on day 85 can live into the next quarter.
- §4.7 — The budget-vote roll uses its own `budgetVote` stream; the fail branch is applied as a fixed bundle through the same pipeline (so difficulty and modifiers affect it like any other loss).
- §8 — Upgrades can be bought in any non-terminal phase (the tree pauses the clock and is reachable at any time).

## Blockers
_None._

## Balance log
_Filled in P9._
