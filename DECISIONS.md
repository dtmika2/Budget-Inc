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
- §4.6 — Election-night noise uses `rng.nextOpen()` (never exactly 0 or 1) so `ln(u/(1−u))` is finite; D'Hondt ties go to the region listed first in `data/regions.json`.
- §4.9 — For an ending, `P_final` is the projection recomputed at the moment of the ending (not the weekly displayed value); same for elections (S, T, P are fresh at election time).
- §13 — Greedy bot value = re-election probability P after the midpoints of the previewed ranges, minus small safety terms when Coalition/Support/Finances/Prestige approach 0 or anger approaches 100 (Oligarchs weighted most) — pure P ignores Finances and Coalition, which made the bot walk into snap elections and endings. Ongoing effects count at half their total. Austerity Freeze is timed to cover the budget vote's mandatory growth; Campaign Mode is used when it raises the value by > 0.03 (or late in the year if it helps at all).
- §13 — The random bot also rerolls (15 % per draft), buys a random affordable upgrade (1 % per day) and uses its ability (0.5 % per day) so replay tests exercise every input kind.
- plan §0.1.7 — UI phases P6–P8 were built in one pass and committed together: every screen shares the store and `Game.tsx` mounts all modals, so P6 alone would not build without stubs. The gate ran on the combined result, followed by browser screenshot checks at 1366×768 and 390×844.
- visual direction — Night-violet ground (#1b1729), gold region borders (#d9b45a, from the `Mapa.png` mood), policy cards as paper memos (#efe6cf) with a stamp-red (#c8352e) "Prosadit" stamp animation as the one signature motion; hard pixel offset shadows, segmented resource bars. Fonts are bundled via npm (`@fontsource/*`), never fetched at runtime: Pixelify Sans (headings), Silkscreen (numerals; Pixelify's 5 reads as S), Atkinson Hyperlegible (body).
- §5.3 art — Placeholder leader sprites are original 16×18 pixel caricatures drawn in code (`LeaderSprite.tsx`), coloured by party, with initials and a 2-frame idle bob; no likeness of real people.
- §4.6 map display — Regions show support as a liquid level instead of a colour tint (requested change): each kraj is a mustard-beige glass (#d6bc6c) clipped to its shape, filled with wine-red liquid (#6b1430, crest #a8334f, back wave #8a2241, spray #c25a72) up to s_r % of the region's bounding-box height; outlines are dark brown so they read on beige. The surface is a two-layer pixel wave (6-unit pixels) with an irregular but seamless profile (mixed integer harmonics over 48/40 columns plus occasional spray pixels); each region has its own offset, speed and phase. Waves scroll one pixel column per step; the level steps to new values when the weekly projection updates; election night fills each region to s_r_final as it is revealed. The liquid no longer uses the party colour. Reduced motion stops waves and level animation. (`src/ui/map/Liquid.tsx`.)
- §4.3 trend arrows — Compare the two latest weekly trend snapshots (7 days apart), so arrows update weekly together with the projection.
- §7.2 — The news pop-up auto-dismiss timer runs in real time (also while paused); the response countdown runs only while the game is running and unpaused. Tapping a news pop-up dismisses it.
- §4.3 — The ≥90 anger warning is presentation logic in the UI store (once per crossing, re-armed below 80); it is not a core log entry.
- §12.3 tutorial — Coach-mark order: draft (shown on the Q1 draft), top bar, map + projection, side panel, first opportunity pin (waits for a pin), upgrade tree. The target is highlighted with a pulsing outline; the clock is paused while a mark is open.
- §6.3 — Cards always list all 4 resources (unaffected ones shown as a muted 0); anger shown as ▲/▼ ranges; ongoing effects with ↻ icon, per-day value and duration.
- §12.2 — Mobile: drawer opened by a "Panel" button; draft and budget-vote options in a scroll-snap carousel with a peek of the next card; pop-ups full width at the bottom.
- dev — `?debug=1` shows the developer overlay (chapter codes, revPct/expPct, balance, finance terms, seed, phase, S/T/P) and exposes the store as `window.__budgetInc` for browser checks; the overlay ignores pointer events.
- plan P10 mobile — Checked in headless Chrome mobile emulation at 375×667 and 390×844 (menu, leader select, draft + tutorial, scrolled carousel, running game, drawer, upgrade tree, pause menu): no horizontal scroll, no visible touch target under 44 px, drawer fully on screen, carousel scrollable. Fixes made: the projection label is shortened to "Projekce" on phones, range chips stack full width with no mid-number wrapping, and the draft coach mark no longer stretches full height.
- plan P10 performance — Measured in headless Chrome (390×844, mobile emulation, CDP CPU throttling ×4, game at 4×): ~142 fps average, p95 frame 7 ms over 8 s. Headless rAF timing is only indicative; not yet measured on a physical mid-range phone. Rendering is slice-subscribed (`useStore(selector)` with shallow equality); ticks are batched into one notification per frame; the map re-tints only when the weekly projection changes.
- plan P10 — Browser checks used `playwright-core` driving the locally installed Chrome from the session scratchpad (not a project dependency).

## Blockers
_None._

## Balance log
**Balance is provisional:** 44 generated `[FILLER]` cards stand in for real content, and the budget is MOCK DATA. Re-run `npm run simulate` and `npm run analyze` once Daniel's cards and the Státní pokladna data arrive.

Tools: `npm run simulate -- --runs N --bot random|greedy|both --leader mupka|abis|both --difficulty easy|normal|hard|all` and `npm run analyze -- --runs N [--set config.path=value] [--leader abis.start.support=45]` (end-of-run averages, with in-memory config/leader overrides for experiments).

| # | change (Normal) | random Mupka | random Abis | greedy Mupka | greedy Abis | notes |
|---|---|---|---|---|---|---|
| 0 | spec defaults (support drift −0.05, coalition −0.03, T_base 45) | 9.5 % | 78.5 % | 73.0 % | 98.4 % | 74–99 % of runs end in a snap election: Coalition always drains to 0, and a snap election while support is high is an easy win |
| 1 | coalition drift −0.03 → −0.015, support drift −0.05 → −0.07 | 0 % | 44 % | 28 % | 92 % | greedy Mupka reaches Q15.4 on average, snap 19 % |
| 2 | + T_base 47 / 49 (not kept) | 0 / 0 % | 41 / 38 % | 24 / 20 % | 90 / 89 % | threshold barely moves Abis (avg support 70) → T_base stays at the spec's 45 |
| 3 | filler `angerUp` 3–9 → 4–12 (reverted) | 0.9 % | 42.8 % | 29.1 % | 89.4 % | aimed at making the Oligarchs ending reachable; no effect — reverted, filler unchanged |
| **final** | **iteration 1 values**, 2000 runs/row | **0.9 %** | **43.0 %** | **29.0 %** | **90.0 %** | greedy Mupka avg 15.4 quarters; ending 0 % |

Difficulty direction (1000 runs/row): greedy Mupka easy 89.4 % → normal 29.7 % → hard 5.0 %; greedy Abis 100 % → 91.3 % → 59.2 %; random Mupka 10.7 % → 1.0 % → 0.1 %; random Abis 93.3 % → 43.8 % → 13.0 %. All move in the expected direction.

**Targets met:** random Mupka ≤ 15 %, greedy Mupka 20–40 %, greedy Mupka run length ≈ 16 quarters (15.4).
**Targets NOT met:** random Abis (43 % > 15 %), greedy Abis (90 % > 40 %), leader parity (61 pp gap > 10 pp).
- Cause (structural, in leader data, not config): Bander Abis starts with support 55 vs 40 and Campaign Mode adds +10 support every year (~+40 over a term), while Mupka's Austerity Freeze only protects Finances, which the election formula (§4.6) does not use. Config knobs act on both leaders equally, so they cannot close the gap.
- Measured proposal for Daniel (in-memory experiment, not applied; spec §5.1 values are kept): Campaign Mode support +10 → +5 **and** Abis start support 55 → 45 gives greedy Abis 43 % / random Abis 7 % (vs greedy Mupka 24 % at T_base 47). Closing the rest probably needs Austerity Freeze to touch P (or Mupka to get a support-side ability).
- The Oligarchs ending never fired in bot runs (greedy avoids it; random picks spread anger over 5 groups and anger decays ~1.8/quarter). It is reachable through deliberate play (e.g. the `[DUMMY] Karta 6` +15…20). Real content with stronger oligarch trade-offs will make it rarer-but-possible as intended.
